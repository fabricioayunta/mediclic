function saludo() {
  const h = new Date().getHours();
  if (h < 12) return "¡Buen día!";
  if (h < 20) return "¡Buenas tardes!";
  return "¡Buenas noches!";
}

function fechaHoy() {
  return new Date().toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long"
  });
}

function pantallaAviso() {
  document.getElementById("app").innerHTML = `
    <h1>Mediclic</h1>
    <div class="tarjeta">
      <p><strong>Antes de empezar</strong></p>
      <p>Mediclic te ayuda a recordar tus medicamentos. No reemplaza a tu médico ni a tu farmacéutico.</p>
      <p>Cargá tus medicamentos siguiendo siempre las indicaciones de tu profesional de salud.</p>
      <button class="boton" id="aceptar">ENTENDIDO</button>
    </div>`;
  document.getElementById("aceptar").onclick = () => {
    localStorage.setItem("aviso_aceptado", "si");
    pantallaInicio();
  };
}

function pantallaInicio() {
  document.getElementById("app").innerHTML = `
    <h1>${saludo()}</h1>
    <p class="fecha">${fechaHoy()}</p>
    <div class="tarjeta">
      <p>Hola Mediclic 👋</p>
      <p>La app ya está instalada y funcionando.</p>
    </div>`;
}

if (localStorage.getItem("aviso_aceptado") === "si") {
  pantallaInicio();
} else {
  pantallaAviso();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
