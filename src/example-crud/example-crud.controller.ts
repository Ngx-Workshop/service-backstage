import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProperty,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RemoteAuthGuard } from '@tmdjr/ngx-auth-client';
import {
  CreateExampleMongodbDocDto,
  ExampleMongodbDocDto,
} from './dto/create.dto';
import { UpdateExampleMongodbDocDto } from './dto/update.dto';
import { ExampleCrudService } from './example-crud.service';

export class AuthTestDto {
  @ApiProperty()
  message: string;
}

@ApiTags('Example Crud')
@Controller('example-crud')
export class ExampleCrudController {
  constructor(private readonly exampleCrudService: ExampleCrudService) {}

  @Get('auth-test')
  @UseGuards(RemoteAuthGuard)
  @ApiOkResponse({ type: AuthTestDto })
  authTest() {
    return this.exampleCrudService.authTest();
  }

  @Post()
  @ApiCreatedResponse({ type: ExampleMongodbDocDto })
  create(@Body() createExampleMongodbDocDto: CreateExampleMongodbDocDto) {
    return this.exampleCrudService.create(createExampleMongodbDocDto);
  }

  @ApiQuery({
    name: 'archived',
    required: false,
    type: Boolean,
    description: 'Filter by archived status',
  })
  @Get()
  @ApiOkResponse({ type: ExampleMongodbDocDto, isArray: true })
  findAll(@Query('archived') archived?: string) {
    const archivedFilter =
      archived === 'true' ? true : archived === 'false' ? false : undefined;
    return this.exampleCrudService.findAll(archivedFilter);
  }

  @Get(':id')
  @ApiOkResponse({ type: ExampleMongodbDocDto })
  findOne(@Param('id') id: string) {
    return this.exampleCrudService.findOne(id);
  }

  @Get('name/:name')
  @ApiOkResponse({ type: ExampleMongodbDocDto })
  findByName(@Param('name') name: string) {
    return this.exampleCrudService.findByName(name);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ExampleMongodbDocDto })
  update(
    @Param('id') id: string,
    @Body() updateExampleMongodbDocDto: UpdateExampleMongodbDocDto
  ) {
    return this.exampleCrudService.update(id, updateExampleMongodbDocDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Param('id') id: string) {
    return this.exampleCrudService.remove(id);
  }

  @Patch(':id/archive')
  @ApiOkResponse({ type: ExampleMongodbDocDto })
  archive(@Param('id') id: string) {
    return this.exampleCrudService.archive(id);
  }

  @Patch(':id/unarchive')
  @ApiOkResponse({ type: ExampleMongodbDocDto })
  unarchive(@Param('id') id: string) {
    return this.exampleCrudService.unarchive(id);
  }
}
