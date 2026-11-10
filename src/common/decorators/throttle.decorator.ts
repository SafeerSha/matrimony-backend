import 'reflect-metadata';

export interface ThrottleOptions {
  [name: string]: {
    limit: number;
    ttl: number;
    blockDuration?: number;
  };
}

/**
 * Custom Throttle decorator matching @nestjs/throttler metadata keys
 * without triggering ESM cycle require errors in Jest runtime.
 */
export const Throttle = (options: ThrottleOptions) => {
  return (target: any, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<any>) => {
    const reflectionTarget = descriptor ? descriptor.value : target;
    for (const name in options) {
      Reflect.defineMetadata('THROTTLER:TTL' + name, options[name].ttl, reflectionTarget);
      Reflect.defineMetadata('THROTTLER:LIMIT' + name, options[name].limit, reflectionTarget);
      if (options[name].blockDuration !== undefined) {
        Reflect.defineMetadata('THROTTLER:BLOCK_DURATION' + name, options[name].blockDuration, reflectionTarget);
      }
    }
    return descriptor ? descriptor : target;
  };
};

export const SkipThrottle = (skip: Record<string, boolean> = { default: true }) => {
  return (target: any, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<any>) => {
    const reflectionTarget = descriptor ? descriptor.value : target;
    for (const key in skip) {
      Reflect.defineMetadata('THROTTLER:SKIP' + key, skip[key], reflectionTarget);
    }
    return descriptor ? descriptor : target;
  };
};
