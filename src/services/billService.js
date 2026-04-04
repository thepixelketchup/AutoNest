import { db } from './firebase';
import { collection, doc, setDoc, deleteDoc, query, where, getDocs, writeBatch } from 'firebase/firestore';

export async function getBills(householdId) {
  const q = query(collection(db, 'Households', householdId, 'bills'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function addBill(householdId, billData) {
  const newBillRef = doc(collection(db, 'Households', householdId, 'bills'));
  const newBill = {
    id: newBillRef.id,
    householdId,
    ...billData
  };
  await setDoc(newBillRef, newBill);
  return newBill;
}

export async function deleteBill(householdId, billId) {
  await deleteDoc(doc(db, 'Households', householdId, 'bills', billId));
}

export async function updateBill(householdId, billId, updates) {
  const billRef = doc(db, 'Households', householdId, 'bills', billId);
  await setDoc(billRef, updates, { merge: true });
}

export async function getTransactions(householdId, month, year) {
  if (month && year) {
    const q = query(
      collection(db, 'Households', householdId, 'transactions'), 
      where("month", "==", month),
      where("year", "==", year)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } else {
    // Return all transactions for the tab
    const q = query(collection(db, 'Households', householdId, 'transactions'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
}

export async function saveTransaction(householdId, billId, transactionData) {
  const transactionId = transactionData.id || `manual_${billId}_${transactionData.year}_${transactionData.month}`;
  const txRef = doc(db, 'Households', householdId, 'transactions', transactionId);
  const txObj = {
    id: transactionId,
    householdId,
    billId,
    ...transactionData
  };
  await setDoc(txRef, txObj, { merge: true });
  return txObj;
}

export async function saveBulkTransactions(householdId, transactions) {
  const batch = writeBatch(db);
  transactions.forEach(tx => {
    const txRef = doc(db, 'Households', householdId, 'transactions', tx.id);
    batch.set(txRef, tx, { merge: true });
  });
  await batch.commit();
}

export async function updateTransaction(householdId, transactionId, updates) {
  const txRef = doc(db, 'Households', householdId, 'transactions', transactionId);
  await setDoc(txRef, updates, { merge: true });
}

export async function updateBulkTransactions(householdId, updatesArray) {
  const batch = writeBatch(db);
  updatesArray.forEach(({ id, updates }) => {
    const txRef = doc(db, 'Households', householdId, 'transactions', id);
    batch.set(txRef, updates, { merge: true });
  });
  await batch.commit();
}

export async function deleteTransaction(householdId, transactionId) {
  await deleteDoc(doc(db, 'Households', householdId, 'transactions', transactionId));
}
