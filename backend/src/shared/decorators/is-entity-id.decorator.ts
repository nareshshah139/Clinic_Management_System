import { IsString, MaxLength, MinLength, ValidationOptions } from 'class-validator';

export function IsEntityId(options?: ValidationOptions): PropertyDecorator {
  return (target, key) => {
    IsString(options)(target, key);
    MinLength(1, options)(target, key);
    MaxLength(128, options)(target, key);
  };
}
