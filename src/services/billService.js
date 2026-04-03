import { db } from './firebase';
import { collection, doc, setDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';

export async function getBills(householdId) {
  const q = query(collection(db, 'Bills'), where("householdId", "==", householdId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function addBill(householdId, billData) {
  const newBillRef = doc(collection(db, 'Bills'));
  const newBill = {
    id: newBillRef.id,
    householdId,
    ...billData
  };
  await setDoc(newBillRef, newBill);
  return newBill;
}

export async function deleteBill(billId) {
  await deleteDoc(doc(db, 'Bills', billId));
}

export async function getTransactions(householdId, month, year) {
  const q = query(
    collection(db, 'Transactions'), 
    where("householdId", "==", householdId),
    where("month", "==", month),
    where("year", "==", year)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function saveTransaction(householdId, billId, transactionData) {
  // Combine billId, year, and month to guarantee 1 transaction per bill per month
  const transactionId = `${billId}_${transactionData.year}_${transactionData.month}`;
  const txRef = doc(db, 'Transactions', transactionId);
  const txObj = {
    id: transactionId,
    householdId,
    billId,
    ...transactionData
  };
  await setDoc(txRef, txObj, { merge: true });
  return txObj;
}
