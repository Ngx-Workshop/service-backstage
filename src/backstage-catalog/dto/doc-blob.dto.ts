import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocFormat } from '../schemas/backstage-repo-cache.schema';

export class DocBlobDto {
  @ApiProperty({ description: 'Raw content of the document' })
  content: string;

  @ApiPropertyOptional({ description: 'Git SHA of the fetched file' })
  sha?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  fetchedAt?: string;

  @ApiPropertyOptional({ enum: ['yaml', 'json', 'markdown'] })
  format?: DocFormat;
}
