import { IsEnum, IsOptional, IsString } from 'class-validator';
import { VettingAction } from '../../schemas/question.schema';

export class VetQuestionDto {
    @IsEnum(VettingAction)
    action: VettingAction;

    @IsOptional()
    @IsString()
    reason?: string;
}
