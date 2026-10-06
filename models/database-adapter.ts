import { PrismaPg } from "@prisma/adapter-pg";

/** Prisma can fan out relation reads inside a transaction, whose pg client is exclusive. */
class TransactionSafePrismaPg extends PrismaPg {
  override async connect() {
    const adapter = await super.connect();
    const startTransaction = adapter.startTransaction.bind(adapter);
    adapter.startTransaction = async isolationLevel => {
      const transaction = await startTransaction(isolationLevel);
      // One queue per transaction, never across the pool or across requests.
      let pending: Promise<void> = Promise.resolve();
      function sequential<A extends unknown[], R>(operation: (...args: A) => Promise<R>) {
        return (...args: A): Promise<R> => {
          const result = pending.then(() => operation(...args));
          // Keep rollback possible after errors, while returning the original rejection.
          pending = result.then(() => undefined, () => undefined);
          return result;
        };
      }
      transaction.queryRaw = sequential(transaction.queryRaw.bind(transaction));
      transaction.executeRaw = sequential(transaction.executeRaw.bind(transaction));
      return transaction;
    };
    return adapter;
  }
}

/** Honor Prisma's optional schema URL parameter for isolated environments. */
export function databaseAdapter(connectionString: string) {
  const schema = new URL(connectionString).searchParams.get("schema") ?? "public";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error("Esquema de base de datos inválido.");
  return new TransactionSafePrismaPg({ connectionString, options: `-c search_path=${schema}` }, { schema });
}
