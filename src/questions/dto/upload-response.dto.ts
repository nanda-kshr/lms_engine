export class UploadErrorDto {
    row: number;
    reason: string;
}

export class UploadResponseDto {
    upload_batch_id: string;
    total_rows: number;
    accepted_rows: number;
    rejected_rows: number;
    errors: UploadErrorDto[];
}
