import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class SyncRequestDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Optional list of repo names to sync; defaults to all repos in the org',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  repos?: string[];

  @ApiPropertyOptional({
    description: 'Force re-fetch even if SHA is unchanged',
  })
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class SyncResponseDto {
  @ApiProperty() total: number;

  @ApiProperty() succeeded: number;

  @ApiProperty() failed: number;

  @ApiProperty({ description: 'Duration in milliseconds' })
  durationMs: number;

  @ApiProperty({
    type: [String],
    description:
      'Repos that failed to sync (with error message inline if available)',
  })
  @ValidateIf((o) => !!o.failures?.length)
  failures?: string[];
}
