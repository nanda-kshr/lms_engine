import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
    constructor(@InjectConnection() private readonly connection: Connection) { }

    @Get()
    check() {
        const isDbUp = this.connection.readyState === 1;

        return {
            status: 'ok',
            db: isDbUp ? 'up' : 'down',
            timestamp: new Date().toISOString(),
        };
    }
}
