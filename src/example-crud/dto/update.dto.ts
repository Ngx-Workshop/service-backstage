import { PartialType } from '@nestjs/swagger';
import { CreateExampleMongodbDocDto } from './create.dto';

export class UpdateExampleMongodbDocDto extends PartialType(
  CreateExampleMongodbDocDto
) {}
