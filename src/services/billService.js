import { db } from './firebase';
import { collection, doc, setDoc, deleteDoc, query, where, getDocs, writeBatch } from 'firebase/firestore';

export async function getProviders(householdId) {
  const q = query(collection(db, 'Households', householdId, 'providers'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function addProvider(householdId, providerData) {
  const newProviderRef = doc(collection(db, 'Households', householdId, 'providers'));
  const newProvider = {
    id: newProviderRef.id,
    householdId,
    ...providerData
  };
  await setDoc(newProviderRef, newProvider);
  return newProvider;
}

export async function deleteProvider(householdId, providerId) {
  await deleteDoc(doc(db, 'Households', householdId, 'providers', providerId));
}

export async function updateProvider(householdId, providerId, updates) {
  const providerRef = doc(db, 'Households', householdId, 'providers', providerId);
  await setDoc(providerRef, updates, { merge: true });
}

export async function getGeneratedBills(householdId, month, year) {
  let q = query(collection(db, 'Households', householdId, 'bills'));
  if (month && year) {
     q = query(collection(db, 'Households', householdId, 'bills'), 
       where("month", "==", month), 
       where("year", "==", year));
  }
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function generateDueBills(householdId) {
  // Scans providers and generates missing bills for up to the current month + 1 future month
  const providers = await getProviders(householdId);
  const existingBills = await getGeneratedBills(householdId);
  
  const batch = writeBatch(db);
  const now = new Date();
  let addedCount = 0;

  // We look back 3 months and 1 month ahead to generate anything missing
  const monthsToCheck = [];
  for (let i = -3; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    monthsToCheck.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }

  providers.forEach(provider => {
    monthsToCheck.forEach(({ month, year }) => {
      // Check if a bill instance already exists for this provider, month, and year
      const exists = existingBills.some(b => b.providerId === provider.id && b.month === month && b.year === year);
      
      if (!exists) {
        // Generate a deterministic bill ID to prevent double insertion in race conditions
        const generatedBillId = `bill_${provider.id}_${year}_${month}`;
        const newBillRef = doc(db, 'Households', householdId, 'bills', generatedBillId);
        
        batch.set(newBillRef, {
          id: generatedBillId,
          householdId,
          providerId: provider.id,
          month,
          year,
          expectedAmount: provider.expectedAmount,
          expectedDay: provider.expectedDay || 1,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
        addedCount++;
      }
    });
  });

  if (addedCount > 0) {
    await batch.commit();
  }
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
