
import coremltools as ct, coremltools.optimize.coreml as cto
OUT = "/tmp/embed-exp/step1c/coreml"
ml = ct.models.MLModel(f"{OUT}/siglip-f16.mlpackage")
p = cto.palettize_weights(ml, cto.OptimizationConfig(global_config=cto.OpPalettizerConfig(mode="kmeans", nbits=8, granularity="per_tensor")))
p.save(f"{OUT}/siglip-w8pal.mlpackage"); print("saved w8pal", flush=True)
