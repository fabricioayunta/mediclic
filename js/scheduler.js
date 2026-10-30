// Mediclic - Lógica de horarios y dosis del día.
// No toca la pantalla ni la base de datos: solo calcula.
const Agenda = (() => {
  // Una dosis se puede confirmar desde unos minutos antes de su hora
  // (para evitar toques accidentales en tomas que están lejos).
  const MARGEN_ANTICIPO_MIN = 60;

  function idToma(medId, fecha, hora) {
    return `${medId}|${fecha}|${hora}`;
  }

  function diaDeSemana(fechaISO) {
    const [a, m, d] = fechaISO.split("-").map(Number);
    return new Date(a, m - 1, d).getDay(); // 0 = domingo
  }

  function aplicaEnFecha(med, fechaISO) {
    if (fechaISO < med.fechaInicio) return false;
    if (med.fechaFin && fechaISO > med.fechaFin) return false;
    if (med.frecuencia === "todos") return true;
    return med.dias.includes(diaDeSemana(fechaISO));
  }

  function aMinutos(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  // Estados:
  //   "tomado":    ya hay un registro de toma.
  //   "vencida":   pasó el horario y nadie la confirmó (NUNCA se marca sola como tomada).
  //   "pendiente": todavía no llegó el horario.
  function dosisDelDia(medicamentos, tomas, fechaISO, ahora) {
    const registradas = new Map(tomas.map((t) => [t.id, t]));
    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
    const lista = [];

    medicamentos
      .filter((m) => aplicaEnFecha(m, fechaISO))
      .forEach((m) => {
        m.horarios.forEach((hora) => {
          const id = idToma(m.id, fechaISO, hora);
          const toma = registradas.get(id);
          const minutosDosis = aMinutos(hora);

          let estado;
          if (toma) estado = "tomado";
          else if (minutosDosis < minutosAhora) estado = "vencida";
          else estado = "pendiente";

          const puedeConfirmar =
            estado === "vencida" ||
            (estado === "pendiente" && minutosDosis - minutosAhora <= MARGEN_ANTICIPO_MIN);

          lista.push({
            id,
            medId: m.id,
            nombre: m.nombre,
            dosis: m.dosis,
            hora,
            fecha: fechaISO,
            estado,
            horaReal: toma ? toma.horaReal : null,
            puedeConfirmar
          });
        });
      });

    lista.sort((a, b) => a.hora.localeCompare(b.hora) || a.nombre.localeCompare(b.nombre, "es"));
    return lista;
  }

  return { dosisDelDia, idToma, aplicaEnFecha, MARGEN_ANTICIPO_MIN };
})();

if (typeof module !== "undefined") module.exports = Agenda;
