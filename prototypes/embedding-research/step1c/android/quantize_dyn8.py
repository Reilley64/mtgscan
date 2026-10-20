
from ai_edge_quantizer import quantizer, recipe_manager, qtyping
M = "/tmp/embed-exp/step1c/android/models"
# dynamic_wi8_afp32 on ALL_SUPPORTED produced a BATCH_MATMUL with an int8 constant LHS that the kernel rejects; quantize FC and conv only.
rm = recipe_manager.RecipeManager()
for op in (qtyping.TFLOperationName.FULLY_CONNECTED, qtyping.TFLOperationName.CONV_2D):
    rm.add_dynamic_config(".*", op, 8)
q = quantizer.Quantizer(f"{M}/pes16-f32.tflite"); q.load_quantization_recipe(rm.get_quantization_recipe())
q.quantize().export_model(f"{M}/pes16-dyn8.tflite", overwrite=True); print("saved dyn8", flush=True)
