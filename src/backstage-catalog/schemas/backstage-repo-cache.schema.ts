import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DocFormat = 'yaml' | 'json' | 'markdown';

export type DocBlob = {
  content: string;
  sha?: string;
  fetchedAt?: Date;
  format?: DocFormat;
};

export type BackstageRepoCacheDocument = BackstageRepoCache & Document;

@Schema({ timestamps: true, collection: 'backstage_repo_cache' })
export class BackstageRepoCache extends Document {
  @Prop({ required: true, unique: true })
  repoName: string;

  @Prop() description?: string;

  @Prop({ type: [String], default: [] })
  topics: string[];

  @Prop({ type: Object })
  languages?: Record<string, number>;

  @Prop() defaultBranch?: string;

  @Prop() htmlUrl?: string;

  @Prop({ type: Date })
  lastSyncAt?: Date;

  @Prop({ type: Object })
  readme?: DocBlob | null;

  @Prop({ type: Object })
  openapi?: DocBlob | null;

  @Prop({ type: Object })
  runbook?: DocBlob | null;

  @Prop({ type: Object })
  serviceMetadata?: DocBlob | null;

  @Prop({
    type: String,
    enum: ['idle', 'ok', 'partial', 'failed', 'rate_limited'],
    default: 'idle',
  })
  syncStatus: 'idle' | 'ok' | 'partial' | 'failed' | 'rate_limited';

  @Prop()
  syncError?: string;
}

export const BackstageRepoCacheSchema =
  SchemaFactory.createForClass(BackstageRepoCache);

BackstageRepoCacheSchema.index({ repoName: 1 }, { unique: true });
BackstageRepoCacheSchema.index({
  repoName: 'text',
  description: 'text',
  topics: 'text',
});
