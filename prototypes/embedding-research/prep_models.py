
import torch, numpy as np, torch.nn.functional as F
from PIL import Image
IMN = ((0.485,0.456,0.406),(0.229,0.224,0.225))
HALF = ((0.5,)*3,(0.5,)*3)

def load_base(name):
    if name == "siglip2_b16_256":
        from transformers import AutoModel
        m = AutoModel.from_pretrained("google/siglip2-base-patch16-256").vision_model
        def f(x):
            return m(pixel_values=x).pooler_output
        return m, 256, HALF, f
    if name in ("pe_core_s16_384", "pe_core_b16_224"):
        import open_clip
        arch = {"pe_core_s16_384": "PE-Core-S-16-384", "pe_core_b16_224": "PE-Core-B-16"}[name]
        m, _, pre = open_clip.create_model_and_transforms(arch, pretrained="meta")
        norm = [t for t in pre.transforms if t.__class__.__name__ == "Normalize"][0]
        size = m.visual.image_size; size = size[0] if isinstance(size,(tuple,list)) else size
        v = m.visual
        return v, size, (tuple(norm.mean), tuple(norm.std)), lambda x: v(x)
    if name == "dinov3_s16":
        import timm
        m = timm.create_model("vit_small_patch16_dinov3.lvd1689m", pretrained=True, num_classes=0, dynamic_img_size=True)
        npt = m.num_prefix_tokens
        def f(x, pool="cls"):
            t = m.forward_features(x)
            cls, mean = t[:, 0], t[:, npt:].mean(1)
            if pool == "cls": return cls
            if pool == "mean": return mean
            return torch.cat([F.normalize(cls, dim=-1), F.normalize(mean, dim=-1)], -1)
        return m, 224, IMN, f
    raise SystemExit(name)

def prep(im, mode, W, H, mean):
    """im: PIL RGB upright card. mode: squash | pad | crop. Output float tensor 3xHxW in [0,1]."""
    if mode == "squash":
        im = im.resize((W, H), Image.BICUBIC)
    elif mode == "pad":
        w, h = im.size; s = min(W / w, H / h); nw, nh = max(1, round(w * s)), max(1, round(h * s))
        bg = Image.new("RGB", (W, H), tuple(int(255 * c) for c in mean))
        bg.paste(im.resize((nw, nh), Image.BICUBIC), ((W - nw) // 2, (H - nh) // 2)); im = bg
    elif mode == "crop":
        w, h = im.size; s = max(W / w, H / h); im = im.resize((max(W, round(w * s)), max(H, round(h * s))), Image.BICUBIC)
        w, h = im.size; l, t = (w - W) // 2, (h - H) // 2; im = im.crop((l, t, l + W, t + H))
    return torch.from_numpy(np.asarray(im, dtype=np.float32) / 255).permute(2, 0, 1)
