
from ai_edge_quantizer import quantizer, recipe, recipe_manager, qtyping
from ai_edge_quantizer.algorithm_manager import AlgorithmName
M = "/tmp/embed-exp/step1c/android/models"
def go(name, rec):
    q = quantizer.Quantizer(f"{M}/pes16-f32.tflite"); q.load_quantization_recipe(rec)
    q.quantize().export_model(f"{M}/pes16-{name}.tflite", overwrite=True); print("saved", name, flush=True)
rm = recipe_manager.RecipeManager()
rm.add_weight_only_config(".*", qtyping.TFLOperationName.ALL_SUPPORTED, 16, algorithm_key=AlgorithmName.FLOAT_CASTING)
go("w16", rm.get_quantization_recipe())
go("dyn8", recipe.dynamic_wi8_afp32())
go("w8", recipe.weight_only_wi8_afp32())
