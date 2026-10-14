// =====================================================
// Seguimiento de proyectos: avance planificado frente al avance real
//  - Avance planificado de una actividad en el día d = (d - ES)/duración, entre 0 % y 100 %
//  - Avance del proyecto = promedio ponderado por la duración de cada actividad
//  - Estado: atrasada / adelantada si la desviación supera la tolerancia (puntos porcentuales)
// =====================================================
const TOLERANCIA = 5;

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

function estadoPorDesviacion(real, planificado) {
  if (real >= 100) return 'completada';
  if (planificado === null) return real > 0 ? 'en_curso' : 'sin_iniciar';
  const d = real - planificado;
  if (d < -TOLERANCIA) return 'atrasada';
  if (d > TOLERANCIA) return 'adelantada';
  return 'en_plazo';
}

// avances: { codigo: porcentajeReal (0-100) }.  diaCorte: días desde el inicio del proyecto (o null)
function evaluarSeguimiento(analisis, avances = {}, diaCorte = null) {
  if (diaCorte !== null && (!Number.isFinite(diaCorte) || diaCorte < 0)) {
    throw new Error('El día de corte debe ser un número mayor o igual que 0.');
  }
  const actividades = analisis.actividades.map((a) => {
    const crudo = avances[a.id];
    const real = crudo === undefined || crudo === null ? 0 : Number(crudo);
    if (!Number.isFinite(real) || real < 0 || real > 100) {
      throw new Error(`El avance de "${a.id}" debe estar entre 0 y 100.`);
    }
    let planificado = null;
    if (diaCorte !== null) {
      planificado = a.duracion > 0
        ? limitar(((diaCorte - a.es) / a.duracion) * 100, 0, 100)
        : (diaCorte >= a.ef ? 100 : 0);
    }
    return {
      id: a.id, critica: a.critica, duracion: a.duracion,
      avanceReal: real, avancePlanificado: planificado,
      desviacion: planificado === null ? null : real - planificado,
      estado: estadoPorDesviacion(real, planificado),
    };
  });

  const peso = (a) => a.duracion;
  const total = actividades.reduce((s, a) => s + peso(a), 0);
  const promedio = (campo) => (total > 0
    ? actividades.reduce((s, a) => s + peso(a) * a[campo], 0) / total
    : actividades.reduce((s, a) => s + a[campo], 0) / actividades.length);

  const avanceReal = promedio('avanceReal');
  const avancePlanificado = diaCorte === null ? null : promedio('avancePlanificado');
  return {
    diaCorte,
    avanceReal,
    avancePlanificado,
    desviacion: avancePlanificado === null ? null : avanceReal - avancePlanificado,
    estado: avanceReal >= 100 - 1e-9 ? 'completada' : estadoPorDesviacion(avanceReal, avancePlanificado),
    completadas: actividades.filter((a) => a.avanceReal >= 100).length,
    actividadesAtrasadas: actividades.filter((a) => a.estado === 'atrasada').map((a) => a.id),
    criticasAtrasadas: actividades.filter((a) => a.estado === 'atrasada' && a.critica).map((a) => a.id),
    actividades,
  };
}

module.exports = { evaluarSeguimiento, TOLERANCIA };
