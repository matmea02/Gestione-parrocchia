import { db } from '../firebase';
import { collection, doc, query, where, orderBy, limit, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, writeBatch } from 'firebase/firestore';

export const getParishCollection = (parishId: string, collectionName: string) => {
  return collection(db, 'parishes', parishId, collectionName);
};

export const getParishDoc = (parishId: string, collectionName: string, docId: string) => {
  return doc(db, 'parishes', parishId, collectionName, docId);
};
