// src/firebase.js
import firebase from "firebase/compat/app";
import "firebase/compat/database";

const firebaseConfig = {
  apiKey: "AIzaSyBUk-GWXgArGjc68H3SMguwdK2CFEEX2yI",
  authDomain: "wire-signaling.firebaseapp.com",
  databaseURL: "https://wire-signaling-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "wire-signaling",
  storageBucket: "wire-signaling.firebasestorage.app",
  messagingSenderId: "257172149345",
  appId: "1:257172149345:web:2c6be89c7752ce6b774620"
};

const app = firebase.initializeApp(firebaseConfig);
const database = app.database();

export { database };