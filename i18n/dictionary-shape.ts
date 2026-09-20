export type DictionaryShape<T> = {
  [K in keyof T]: T[K] extends readonly unknown[]
    ? readonly string[]
    : T[K] extends object
    ? DictionaryShape<T[K]>
    : string;
} & Record<string, unknown>;
