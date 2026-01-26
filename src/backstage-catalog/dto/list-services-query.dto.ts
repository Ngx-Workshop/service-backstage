import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ListServicesQueryDto {
  @ApiPropertyOptional({
    description: 'Search by name, description, or topics',
  })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated list of blobs to include (readme,openapi,runbook,metadata)',
  })
  @IsString()
  @IsOptional()
  include?: string;

  @ApiPropertyOptional({
    description: 'Trigger a refresh for the returned items',
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  refresh?: boolean;
}

export class ServiceDetailQueryDto {
  @ApiPropertyOptional({
    description: 'Trigger a refresh before returning details',
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  refresh?: boolean;
}
