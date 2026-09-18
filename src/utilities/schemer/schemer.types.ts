export type POJOValue = string | number | boolean | null | POJOValue[] | POJO

export interface POJO {
  [property: string]: POJOValue
}
