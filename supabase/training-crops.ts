import { z } from 'zod';

import { databaseFunction } from './database-function.ts';
import type { Database } from './database.types.ts';

export type TrainingCrop = Database['public']['Tables']['training_crops']['Row'];

const trainingCropSettings = z.strictObject({ uploads_on: z.boolean() });

export type TrainingCropSettings = z.infer<typeof trainingCropSettings>;

const setTrainingCropUploadsRequest = z.strictObject({ on: z.boolean() });

export type SetTrainingCropUploadsRequest = z.input<typeof setTrainingCropUploadsRequest>;

export type TrainingCropStorage = { bytes_left: number };

export const getTrainingCropSettings = databaseFunction({
  name: 'get_training_crop_settings',
  argument: 'query',
  request: z.strictObject({}).optional(),
  reply: trainingCropSettings,
  errorCodes: ['invalid_argument'],
});

export const setTrainingCropUploads = databaseFunction({
  name: 'set_training_crop_uploads',
  argument: 'request',
  request: setTrainingCropUploadsRequest,
  reply: trainingCropSettings,
  errorCodes: ['invalid_argument'],
});
