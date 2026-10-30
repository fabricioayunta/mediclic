// Mediclic - Sonido, vibración, pantalla encendida y avisos del sistema.
// Todo está protegido con try/catch: si el teléfono no lo permite, la app sigue funcionando.
const Sonido = (() => {
  let contexto = null;
  let temporizador = null;
  let bloqueoPantalla = null;
  let vibrando = false;

  // Los navegadores solo permiten sonido después de que la persona toca la pantalla.
  function desbloquear() {
    try {
      if (!contexto) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) contexto = new AC();
      }
      if (contexto && contexto.state === "suspended") contexto.resume();
    } catch (e) { /* sin sonido */ }
  }

  function pitido() {
    try {
      if (!contexto || !Config.get("sonido")) return;
      const base = contexto.currentTime;
      [0, 0.3, 0.6].forEach((retraso) => {
        const osc = contexto.createOscillator();
        const volumen = contexto.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        volumen.gain.setValueAtTime(0.0001, base + retraso);
        volumen.gain.exponentialRampToValueAtTime(0.5, base + retraso + 0.03);
        volumen.gain.exponentialRampToValueAtTime(0.0001, base + retraso + 0.22);
        osc.connect(volumen);
        volumen.connect(contexto.destination);
        osc.start(base + retraso);
        osc.stop(base + retraso + 0.25);
      });
    } catch (e) { /* sin sonido */ }
  }

  function vibrar() {
    try {
      // Los navegadores bloquean la vibración hasta que la persona toca la pantalla.
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      if (navigator.vibrate && Config.get("vibrar")) { navigator.vibrate([500, 200, 500]); vibrando = true; }
    } catch (e) { /* sin vibración */ }
  }

  async function mantenerPantallaEncendida() {
    try {
      if ("wakeLock" in navigator) bloqueoPantalla = await navigator.wakeLock.request("screen");
    } catch (e) { /* no disponible */ }
  }

  function iniciar() {
    detener();
    desbloquear();
    pitido();
    vibrar();
    temporizador = setInterval(() => { pitido(); vibrar(); }, 3000);
    mantenerPantallaEncendida();
  }

  function detener() {
    if (temporizador) clearInterval(temporizador);
    temporizador = null;
    try {
      if (vibrando && navigator.vibrate) navigator.vibrate(0);
    } catch (e) { /* nada */ }
    vibrando = false;
    try {
      if (bloqueoPantalla) bloqueoPantalla.release();
    } catch (e) { /* nada */ }
    bloqueoPantalla = null;
  }

  function estadoNotificaciones() {
    if (!("Notification" in window)) return "no-disponible";
    return Notification.permission; // "granted" | "denied" | "default"
  }

  async function pedirPermisoNotificaciones() {
    try {
      if (!("Notification" in window)) return "no-disponible";
      return await Notification.requestPermission();
    } catch (e) {
      return "denied";
    }
  }

  async function notificar(titulo, cuerpo, etiqueta) {
    try {
      if (estadoNotificaciones() !== "granted") return;
      const registro = "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration()
        : null;
      const opciones = { body: cuerpo, tag: etiqueta, requireInteraction: true, vibrate: [500, 200, 500] };
      if (registro && registro.showNotification) await registro.showNotification(titulo, opciones);
      else new Notification(titulo, opciones);
    } catch (e) { /* sin aviso del sistema */ }
  }

  return {
    desbloquear, iniciar, detener, pitido, vibrar,
    estadoNotificaciones, pedirPermisoNotificaciones, notificar
  };
})();
