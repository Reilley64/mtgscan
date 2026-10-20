# /// script
# requires-python = "==3.12.*"
# dependencies = [
#   "coremltools==9.0",
#   "torch==2.7.0",
#   "open-clip-torch==3.3.0",
#   "timm==1.0.30",
#   "huggingface-hub==0.36.2",
#   "numpy==1.26.4",
#   "pillow==12.3.0",
# ]
# ///
import argparse
import hashlib
import json
from pathlib import Path

import coremltools as ct
import coremltools.optimize.coreml as cto
import numpy as np
import open_clip
import torch
from huggingface_hub import hf_hub_download
from PIL import Image

ARCHITECTURE = "PE-Core-S-16-384"
WEIGHTS_REVISION = "3249a38eb1c432ec19231c6fe1774acb6a4e4efe"
FLOAT32_OPS = {"mul_0", "matmul_0", "softmax_0"}
COMPUTE_UNITS = ("CPU_ONLY", "CPU_AND_GPU", "CPU_AND_NE", "ALL")
LOWEST_COSINE = 0.99
FIXTURE_GRID = 8

MODULE = Path(__file__).resolve().parent.parent
MODEL_FILE = MODULE / "model.json"
FIXTURE = MODULE / "macos/CardRecognizerTests/Fixtures/fixture-model.mlpackage"
REFERENCES = MODULE.parent.parent / "test/scanner-evidence/real/feature-prints.json"
CACHE = Path.home() / "Library/Caches/mtgscan/models"


class Normalized(torch.nn.Module):
    def __init__(self, visual, mean, std):
        super().__init__()
        self.visual = visual
        self.register_buffer("mean", torch.tensor(mean).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(std).view(1, 3, 1, 1))

    def forward(self, pixels):
        return self.visual((pixels - self.mean) / self.std)


class Fixture(torch.nn.Module):
    def __init__(self, vector_size):
        super().__init__()
        self.pool = torch.nn.AdaptiveAvgPool2d(FIXTURE_GRID)
        generator = torch.Generator().manual_seed(0)
        self.register_buffer("projection", torch.randn(3 * FIXTURE_GRID**2, vector_size, generator=generator))

    def forward(self, pixels):
        cells = self.pool(pixels).flatten(1)
        return cells @ self.projection / cells.mean(1, keepdim=True)


def package_sha256(package):
    files = sorted(path for path in package.rglob("*") if path.is_file())
    listing = "".join(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(package).as_posix()}\n" for path in files)
    return hashlib.sha256(listing.encode()).hexdigest()


def to_core_ml(module, input_size, **options):
    pixels = torch.rand(1, 3, input_size, input_size)
    with torch.no_grad():
        traced = torch.jit.trace(module.eval(), pixels)
    return ct.convert(
        traced,
        inputs=[ct.TensorType(name="pixels", shape=pixels.shape)],
        outputs=[ct.TensorType(name="featurePrint")],
        minimum_deployment_target=ct.target.iOS17,
        convert_to="mlprogram",
        **options,
    )


def load_pe_core():
    config = open_clip.get_pretrained_cfg(ARCHITECTURE, "meta")
    weights = hf_hub_download(config["hf_hub"].rstrip("/"), "open_clip_model.safetensors", revision=WEIGHTS_REVISION)
    model = open_clip.create_model(ARCHITECTURE, pretrained=weights)
    return Normalized(model.visual.float(), config["mean"], config["std"]).eval(), config["mean"]


def padded(path, size, mean):
    card = Image.open(path).convert("RGB")
    scale = min(size / card.width, size / card.height)
    width, height = max(1, round(card.width * scale)), max(1, round(card.height * scale))
    square = Image.new("RGB", (size, size), tuple(int(255 * channel) for channel in mean))
    square.paste(card.resize((width, height), Image.BICUBIC), ((size - width) // 2, (size - height) // 2))
    return np.asarray(square, dtype=np.float32).transpose(2, 0, 1) / 255


def unit(vectors):
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def check(package, reference_model, model_file, mean):
    references = json.loads(REFERENCES.read_text())["references"]
    pixels = np.stack([padded(REFERENCES.parent / reference["crop"], model_file["inputSize"], mean) for reference in references])
    with torch.no_grad():
        expected = unit(reference_model(torch.from_numpy(pixels)).numpy())
    for unit_name in COMPUTE_UNITS:
        model = ct.models.MLModel(str(package), compute_units=getattr(ct.ComputeUnit, unit_name))
        vectors = np.stack([model.predict({"pixels": pixels[i : i + 1]})["featurePrint"].reshape(-1) for i in range(len(pixels))])
        if vectors.shape[1] != model_file["vectorSize"]:
            raise SystemExit(f"{unit_name}: {vectors.shape[1]} values, the model file says {model_file['vectorSize']}")
        if np.isnan(vectors).any():
            raise SystemExit(f"{unit_name}: the model returned NaN")
        lowest = float((unit(vectors) * expected).sum(1).min())
        print(f"{unit_name}: lowest cosine {lowest:.4f} over {len(references)} references, no NaN")
        if lowest < LOWEST_COSINE:
            raise SystemExit(f"{unit_name}: the lowest cosine is below {LOWEST_COSINE}")


def convert(model_file):
    model, mean = load_pe_core()
    kept = set()

    def float16(op):
        if op.name in FLOAT32_OPS:
            kept.add(op.name)
            return False
        return True

    mixed = to_core_ml(model, model_file["inputSize"], compute_precision=ct.transform.FP16ComputePrecision(op_selector=float16))
    if kept != FLOAT32_OPS:
        raise SystemExit(f"The first attention block has no {sorted(FLOAT32_OPS - kept)} to keep in float32")
    palettized = cto.palettize_weights(mixed, cto.OptimizationConfig(global_config=cto.OpPalettizerConfig(mode="kmeans", nbits=8, granularity="per_tensor")))
    package = CACHE / f"{model_file['name']}.mlpackage"
    CACHE.mkdir(parents=True, exist_ok=True)
    palettized.save(str(package))
    print(f"Wrote {package}")
    check(package, model, model_file, mean)
    model_file["sha256"] = package_sha256(package)
    MODEL_FILE.write_text(json.dumps(model_file, indent=2) + "\n")
    print(f"Wrote SHA-256 {model_file['sha256']} to {MODEL_FILE}")


def write_fixture(model_file):
    fixture = to_core_ml(Fixture(model_file["vectorSize"]), model_file["inputSize"], compute_precision=ct.precision.FLOAT16)
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    fixture.save(str(FIXTURE))
    print(f"Wrote {FIXTURE}")


def main():
    parser = argparse.ArgumentParser(description="Convert PE-Core S16-384 to the Core ML model that the recognizer runs.")
    parser.add_argument("--fixture", action="store_true", help="write only the tiny fixture model for the Swift tests")
    model_file = json.loads(MODEL_FILE.read_text())
    if parser.parse_args().fixture:
        write_fixture(model_file)
    else:
        convert(model_file)


main()
