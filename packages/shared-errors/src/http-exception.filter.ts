import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { AppError } from './app.errors';

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
}

// ARCH-DECISION: Centralized exception filter in shared-errors package so all
// microservices return identical error shapes. Never expose internal details
// (stack traces, Prisma errors, DB connection strings) to clients.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message    = 'Internal server error';
    let error      = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res  = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        message = Array.isArray(resObj['message'])
          ? (resObj['message'] as string[]).join('; ')
          : String(resObj['message'] ?? message);
        error = String(resObj['error'] ?? error);
      }
    } else if (exception instanceof ZodError) {
      // ARCH-DECISION: Zod validation errors in service controllers are NOT
      // HttpExceptions — they surface as 400 Bad Request with field details.
      // Without this branch they fall through to the generic 500 handler, hiding
      // validation failures from the client and making debugging impossible.
      statusCode = HttpStatus.BAD_REQUEST;
      error      = 'Bad Request';
      message    = exception.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      this.logger.warn(`Zod validation failed: ${message}`);
    } else if (exception instanceof AppError) {
      // ARCH-DECISION: AppError extends native Error (not NestJS HttpException)
      // so it must be checked BEFORE the generic `instanceof Error` branch.
      // AppError carries httpStatus (401, 403, 404, 409, 422) and a structured
      // toResponse() payload — without this branch every domain error returns 500.
      statusCode = exception.httpStatus;
      const appRes = exception.toResponse();
      message    = appRes.message;
      error      = exception.code;
      this.logger.warn(`AppError [${statusCode}] ${exception.code}: ${exception.message}`);
    } else if (exception instanceof Error) {
      // Log internal errors but do NOT expose message to client
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    } else {
      this.logger.error('Unknown exception type', String(exception));
    }

    const body: ApiError = {
      statusCode,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(body);
  }
}
