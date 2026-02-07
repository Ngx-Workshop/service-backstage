import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocBlobDto } from './doc-blob.dto';

export class ServiceSummaryDto {
  @ApiProperty() repoName: string;

  @ApiPropertyOptional() description?: string;

  @ApiProperty({ type: [String] }) topics: string[];

  @ApiPropertyOptional() defaultBranch?: string;

  @ApiPropertyOptional() htmlUrl?: string;

  @ApiPropertyOptional({ type: Object })
  languages?: Record<string, number>;

  @ApiPropertyOptional({ type: [String] }) deviconLanguages: string[];

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  lastSyncAt?: string;

  @ApiProperty({ enum: ['idle', 'ok', 'partial', 'failed', 'rate_limited'] })
  syncStatus: 'idle' | 'ok' | 'partial' | 'failed' | 'rate_limited';

  @ApiPropertyOptional() syncError?: string;

  @ApiPropertyOptional({ type: () => DocBlobDto })
  readme?: DocBlobDto | null;

  @ApiPropertyOptional({ type: () => DocBlobDto })
  openapi?: DocBlobDto | null;

  @ApiPropertyOptional({ type: () => DocBlobDto })
  runbook?: DocBlobDto | null;

  @ApiPropertyOptional({ type: () => DocBlobDto })
  serviceMetadata?: DocBlobDto | null;
}

export class ServiceDetailDto extends ServiceSummaryDto {}
