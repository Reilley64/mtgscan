import torch
IMN = ((0.485,0.456,0.406),(0.229,0.224,0.225))

def load(name):
    if name == "dinov3_s16":
        import timm
        m = timm.create_model("vit_small_patch16_dinov3.lvd1689m", pretrained=True, num_classes=0)
        return m, 224, IMN, lambda x: m(x)
    if name == "dinov2_s14":
        from transformers import AutoModel
        m = AutoModel.from_pretrained("facebook/dinov2-small")
        return m, 224, IMN, lambda x: m(pixel_values=x).pooler_output
    if name == "siglip2_b16_256":
        from transformers import AutoModel
        m = AutoModel.from_pretrained("google/siglip2-base-patch16-256")
        def f(x):
            o = m.get_image_features(pixel_values=x)
            return o if torch.is_tensor(o) else o.pooler_output
        return m, 256, ((0.5,)*3,(0.5,)*3), f
    if name in ("mobileclip2_s0", "pe_core_s16_384", "pe_core_b16_224"):
        import open_clip
        arch, tag = {"mobileclip2_s0": ("MobileCLIP2-S0","dfndr2b"), "pe_core_s16_384": ("PE-Core-S-16-384","meta"), "pe_core_b16_224": ("PE-Core-B-16","meta")}[name]
        m, _, pre = open_clip.create_model_and_transforms(arch, pretrained=tag)
        norm = [t for t in pre.transforms if t.__class__.__name__ == "Normalize"][0]
        size = m.visual.image_size; size = size[0] if isinstance(size,(tuple,list)) else size
        return m, size, (tuple(norm.mean), tuple(norm.std)), lambda x: m.encode_image(x)
    raise SystemExit(name)

