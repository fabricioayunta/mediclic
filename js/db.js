// Mediclic - Base de datos local (IndexedDB).
// Todo el acceso a los datos pasa por este archivo.
const DB = (() => {
  const NOMBRE = "mediclic";
  const VERSION = 1;
  let conexion = null;

  function abrir() {
    if (conexion) return Promise.resolve(conexion);
    return new Promise((resolve, reject) => {
      const pedido = indexedDB.open(NOMBRE, VERSION);
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        if (!db.objectStoreNames.contains("medicamentos")) {
          db.createObjectStore("medicamentos", { keyPath: "id" });
        }
      };
      pedido.onsuccess = () => {
        conexion = pedido.result;
        resolve(conexion);
      };
      pedido.onerror = () => reject(pedido.error);
    });
  }

  async function operar(modo, accion) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("medicamentos", modo);
      const almacen = tx.objectStore("medicamentos");
      const pedido = accion(almacen);
      tx.oncomplete = () => resolve(pedido ? pedido.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    listar: () => operar("readonly", (a) => a.getAll()),
    obtener: (id) => operar("readonly", (a) => a.get(id)),
    guardar: (medicamento) => operar("readwrite", (a) => a.put(medicamento)),
    eliminar: (id) => operar("readwrite", (a) => a.delete(id)),
    nuevoId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  };
})();
