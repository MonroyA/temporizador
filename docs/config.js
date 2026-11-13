// Configuración de Firebase (la nube donde se guardan las listas).
// Pega aquí los datos de tu proyecto: Firebase › Configuración del proyecto › Tus apps › Web.
// Mientras apiKey esté vacío, la app funciona en MODO DEMOSTRACIÓN (todo se guarda solo en
// este teléfono, para probarla).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCDwikJdFoXvhxIx-qSmrBnKsZ7J0pIhWo',
  authDomain: 'listas-alabanza.firebaseapp.com',
  projectId: 'listas-alabanza',
  storageBucket: 'listas-alabanza.firebasestorage.app',
  messagingSenderId: '123165588271',
  appId: '1:123165588271:web:481c26a56697a71a25bfda',
};
// Avisos con la app cerrada (push): la «clave pública» de Firebase › Configuración del proyecto ›
// Cloud Messaging › Certificados push web. Vacía = solo avisos con la app abierta.
export const VAPID_KEY = 'BAOwubFXgUzZopOn5NrYK3Grw77tHxMLrbOZ7XwayrpFDwPK8RsmDL4h73s5742L0r4ZSgMi8a_NGDb0OxVef8A';
// Dirección del servicio que manda esos avisos (Cloudflare Workers, carpeta nube-avisos).
export const PUSH_URL = 'https://listas-avisos.listas-avisos.workers.dev/';
