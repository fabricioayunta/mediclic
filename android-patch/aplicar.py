#!/usr/bin/env python3
"""Adapta el proyecto Android generado por Capacitor para Mediclic:
permisos de alarmas, ícono, pantalla de arranque e ícono de notificación.
Uso: python3 android-patch/aplicar.py android
"""
import os
import shutil
import sys
import xml.etree.ElementTree as ET

raiz = sys.argv[1] if len(sys.argv) > 1 else "android"
res_destino = os.path.join(raiz, "app", "src", "main", "res")
manifiesto = os.path.join(raiz, "app", "src", "main", "AndroidManifest.xml")
res_origen = os.path.join(os.path.dirname(os.path.abspath(__file__)), "res")

PERMISOS = [
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.SCHEDULE_EXACT_ALARM",
    "android.permission.USE_EXACT_ALARM",
    "android.permission.RECEIVE_BOOT_COMPLETED",
    "android.permission.VIBRATE",
    "android.permission.WAKE_LOCK",
]

# 1) Permisos en el manifiesto
with open(manifiesto, encoding="utf-8") as f:
    texto = f.read()
nuevas = ""
for permiso in PERMISOS:
    if permiso not in texto:
        nuevas += f'    <uses-permission android:name="{permiso}" />\n'
if nuevas:
    texto = texto.replace("</manifest>", nuevas + "</manifest>")
    with open(manifiesto, "w", encoding="utf-8") as f:
        f.write(texto)
print("Permisos agregados:", nuevas.count("uses-permission"))

# 2) Quitar la pantalla de arranque original de Capacitor (splash.png en todas las carpetas)
borradas = 0
for carpeta, _, archivos in os.walk(res_destino):
    for nombre in archivos:
        if nombre == "splash.png":
            os.remove(os.path.join(carpeta, nombre))
            borradas += 1
print("splash.png originales quitados:", borradas)

# 3) Copiar los recursos de Mediclic (íconos, colores, splash)
copiados = 0
for carpeta, _, archivos in os.walk(res_origen):
    relativa = os.path.relpath(carpeta, res_origen)
    destino = os.path.join(res_destino, relativa)
    os.makedirs(destino, exist_ok=True)
    for nombre in archivos:
        shutil.copyfile(os.path.join(carpeta, nombre), os.path.join(destino, nombre))
        copiados += 1
print("Recursos copiados:", copiados)

# 4) Verificar que los XML queden bien formados (si no, que falle acá y no en Gradle)
for ruta in [manifiesto] + [
    os.path.join(c, n) for c, _, ns in os.walk(res_destino) for n in ns if n.endswith(".xml")
]:
    ET.parse(ruta)
print("XML verificados: todo bien")
