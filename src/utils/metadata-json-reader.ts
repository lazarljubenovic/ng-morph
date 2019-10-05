const PRIVATE_PREFIX = 'ɵ';

enum Symbolic {
  Module = 'module',
  Class = 'class',
  Call = 'call',
  Reference = 'reference',
  Constructor = 'constructor',
  Function = 'function',
  Select = 'select'
}

interface MetadataSymbolBase<T extends Symbolic> {
  __symbolic: T;
}

interface MetadataSymbol_Module extends MetadataSymbolBase<Symbolic.Module> {
  version: 4;
  exports: Array<{
    export: Array<{ name: string; as: string }>;
    from: string;
  }>;
  metadata: Record<string, MetadataSymbol>;
}

interface MetadataSymbol_Class extends MetadataSymbolBase<Symbolic.Class> {
  decorators: Array<MetadataSymbol_Call>;
  members: {
    __ctor__: Array<MetadataSymbol_Constructor>;
    [memberName: string]: any; // TODO
  };
  statics: {
    [staticName: string]: MetadataSymbol_Function;
  };
}

interface MetadataSymbol_Call extends MetadataSymbolBase<Symbolic.Call> {
  expression: MetadataSymbol_Reference;
  arguments: Array<{
    providers: MetadataSymbol_Reference;
    exports: Array<MetadataSymbol_Reference>;
  }>;
}

interface MetadataSymbol_Reference_External
  extends MetadataSymbolBase<Symbolic.Reference> {
  module: string;
  name: string;
  line: number;
  character: number;
}

interface MetadataSymbol_Reference_Internal
  extends MetadataSymbolBase<Symbolic.Reference> {
  nam: string;
}

type MetadataSymbol_Reference =
  | MetadataSymbol_Reference_External
  | MetadataSymbol_Reference_Internal;

interface MetadataSymbol_Constructor
  extends MetadataSymbolBase<Symbolic.Constructor> {
  parameterDecorators: Array<Array<MetadataSymbol_Call>>;
  parameters: Array<MetadataSymbol_Reference>;
}

interface MetadataSymbol_Function
  extends MetadataSymbolBase<Symbolic.Function> {
  parameters: string[];
  value: {
    ngModule: MetadataSymbol_Reference;
    providers: Array<MetadataProvider | MetadataSymbol_Reference>;
  };
}

interface MetadataSymbol_Select extends MetadataSymbolBase<Symbolic.Select> {
  expression: MetadataSymbol_Reference;
  member: string;
}

type MetadataSymbol =
  | MetadataSymbol_Module
  | MetadataSymbol_Class
  | MetadataSymbol_Call
  | MetadataSymbol_Reference
  | MetadataSymbol_Constructor
  | MetadataSymbol_Function
  | MetadataSymbol_Select;

interface MetadataSymbolMap {
  [Symbolic.Module]: MetadataSymbol_Module;
  [Symbolic.Class]: MetadataSymbol_Class;
  [Symbolic.Call]: MetadataSymbol_Call;
  [Symbolic.Reference]: MetadataSymbol_Reference;
  [Symbolic.Constructor]: MetadataSymbol_Constructor;
  [Symbolic.Function]: MetadataSymbol_Function;
  [Symbolic.Select]: MetadataSymbol_Select;
}

function isMetadataSymbol<TSymbolic extends Symbolic>(symbol: TSymbolic) {
  return (metadata: MetadataSymbol): metadata is MetadataSymbolMap[TSymbolic] =>
    metadata.__symbolic == symbol;
}

// region Provider types

enum MetadataProviderKey {
  UseValue = 'useValue',
  UseExisting = 'useExisting'
}

interface MetadataProvider_UseValue {
  provide: MetadataSymbol_Reference;
  [MetadataProviderKey.UseValue]: MetadataSymbol_Select;
}

interface MetadataProver_UseExisting {
  provide: MetadataJsonReader;
  [MetadataProviderKey.UseExisting]: MetadataSymbol_Reference;
}

type MetadataProvider = MetadataProvider_UseValue | MetadataProver_UseExisting;

interface MetadataProviderMap {
  [MetadataProviderKey.UseValue]: MetadataProvider_UseValue;
  [MetadataProviderKey.UseExisting]: MetadataProver_UseExisting;
}

function isMetadataProvider<TKey extends MetadataProviderKey>(
  metadataProviderKey: TKey
) {
  return (
    metadataProvider: MetadataProvider
  ): metadataProvider is MetadataProviderMap[TKey] => {
    return metadataProviderKey in metadataProvider;
  };
}

// endregion Provider types

export class MetadataJsonReader {}
