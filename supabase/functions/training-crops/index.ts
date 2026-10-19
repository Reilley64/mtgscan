import { withSupabase } from '@supabase/server';

const bucket = 'training-crops';

type Refusal = { code: string; message: string; details: string | null };

export default {
  fetch: withSupabase({ auth: 'user', cors: false }, async (request, { jwtClaims, supabaseAdmin }) => {
    if (jwtClaims?.client_id !== undefined) {
      return refused(403, { code: 'insufficient_privilege', message: 'AI clients cannot upload training crops.', details: null });
    }
    const form = await request.formData().catch(() => new FormData());
    const image = form.get('image');
    const crop = parsedCrop(form.get('crop'));
    const limits = await supabaseAdmin.storage.getBucket(bucket);
    if (limits.error) {
      return internalError();
    }
    const { allowed_mime_types: types = [], file_size_limit: maxBytes = 0 } = limits.data;
    if (!(image instanceof File) || !types.includes(image.type) || image.size > maxBytes) {
      return refused(400, invalidArgument('image', `image must be a file of type ${types.join(' or ')} and at most ${maxBytes} bytes.`));
    }
    if (crop === undefined) {
      return refused(400, invalidArgument('crop', 'crop must be a JSON object.'));
    }

    const added = await supabaseAdmin.rpc('add_training_crop', {
      request: { user_id: jwtClaims!.sub, copy_id: form.get('copy_id'), crop },
    });
    if (added.error) {
      return added.status === 400 ? refused(400, added.error) : internalError();
    }

    const uploaded = await supabaseAdmin.storage.from(bucket).upload(`${crop.crop_id}.jpg`, image, { contentType: image.type });
    if (uploaded.error && !('statusCode' in uploaded.error && uploaded.error.statusCode === '409')) {
      return internalError();
    }
    return new Response(null, { status: 204 });
  }),
};

function parsedCrop(value: FormDataEntryValue | null): { crop_id: unknown } | undefined {
  try {
    const crop = typeof value === 'string' ? JSON.parse(value) : undefined;
    return crop !== null && typeof crop === 'object' && !Array.isArray(crop) ? crop : undefined;
  } catch {
    return undefined;
  }
}

function invalidArgument(field: string, message: string): Refusal {
  return { code: 'invalid_argument', message, details: field };
}

function refused(status: number, { code, message, details }: Refusal): Response {
  return Response.json({ code, message, details }, { status });
}

function internalError(): Response {
  return refused(500, { code: 'internal_error', message: 'The training crop was not stored. Try again later.', details: null });
}
