import type { Database } from './database.types';

export type TrainingCrop = Database['public']['Tables']['training_crops']['Row'];

export type TrainingCropSettings = { uploads_on: boolean };

export type SetTrainingCropUploadsRequest = { on: boolean };

export type TrainingCropStorage = { bytes_left: number };
