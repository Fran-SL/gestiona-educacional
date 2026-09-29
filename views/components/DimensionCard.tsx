type DimensionCardProps = {
    nombre: string;
    descripcion: string;
    avance: number;
  };
  
  export default function DimensionCard({
    nombre,
    descripcion,
    avance,
  }: DimensionCardProps) {
    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">{nombre}</h3>
  
        <p className="mt-3 text-slate-600">{descripcion}</p>
  
        <div className="mt-6">
          <p className="text-sm font-medium text-slate-500">Avance actual</p>
  
          <p className="mt-1 text-3xl font-bold text-slate-900">{avance}%</p>
  
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${avance}%` }}
            />
          </div>
        </div>
      </article>
    );
  }