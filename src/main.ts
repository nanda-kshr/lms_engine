import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Fail fast if required env vars missing
  if (!process.env.MONGODB_URI) {
    logger.error('MONGODB_URI environment variable is not defined');
    process.exit(1);
  }

  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET environment variable is not defined');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  // Global middleware
  app.use(cookieParser());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application running on port ${port}`);
}
bootstrap();
