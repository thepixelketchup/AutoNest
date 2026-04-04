import { db } from './firebase';
import {
  collection, doc, setDoc, deleteDoc, query, where, getDocs,
  writeBatch, getDoc, arrayUnion, arrayRemove, deleteField
} from 'firebase/firestore';

// ── Shared helpers ────────────────────────────────────────────────────────────
// totalDue = amount + lateFee — that is what must be paid to clear the bill
function computeBillStatus(amount, lateFee, totalPaid, dueDate) {
  const totalDue = Number(amount || 0) + Number(lateFee || 0);
  const paid     = Number(totalPaid || 0);
  if (totalDue > 0 && paid >= totalDue - 0.01) return 'cleared';
  if (paid > 0) return 'partial';
  if (dueDate && new Date(dueDate) < new Date()) return 'overdue';
  return 'pending';
}

/** Normalize legacy auto-generated bill shape → new manual shape */
function normalizeBill(id, data) {
  if (data.billingPeriod) return { id, ...data }; // already new format
  // Legacy: had month, year, expectedAmount, expectedDay
  return {
    id,
    ...data,
    amount: data.amount ?? data.expectedAmount ?? 0,
    lateFee: data.lateFee ?? 0,
    billingPeriod: { type: 'month', month: data.month, year: data.year },
    transactionIds: data.transactionIds ?? (data.billId ? [data.billId] : []),
    totalPaid: data.totalPaid ?? 0,
    status: data.status ?? 'pending',
    notes: data.notes ?? '',
    _legacy: true,
  };
}

// ── Provider CRUD ─────────────────────────────────────────────────────────────
export async function getProviders(householdId) {
  const snap = await getDocs(query(collection(db, 'Households', householdId, 'providers')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addProvider(householdId, data) {
  const ref = doc(collection(db, 'Households', householdId, 'providers'));
  const obj = { id: ref.id, householdId, ...data };
  await setDoc(ref, obj);
  return obj;
}
export async function deleteProvider(householdId, providerId) {
  await deleteDoc(doc(db, 'Households', householdId, 'providers', providerId));
}
export async function updateProvider(householdId, providerId, updates) {
  await setDoc(doc(db, 'Households', householdId, 'providers', providerId), updates, { merge: true });
}

// ── Member CRUD ───────────────────────────────────────────────────────────────
export async function getMembers(householdId) {
  const snap = await getDocs(query(collection(db, 'Households', householdId, 'members')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addMember(householdId, data) {
  const ref = doc(collection(db, 'Households', householdId, 'members'));
  const obj = { id: ref.id, householdId, ...data };
  await setDoc(ref, obj);
  return obj;
}
export async function deleteMember(householdId, memberId) {
  await deleteDoc(doc(db, 'Households', householdId, 'members', memberId));
}
export async function updateMember(householdId, memberId, updates) {
  await setDoc(doc(db, 'Households', householdId, 'members', memberId), updates, { merge: true });
}

// ── Bill CRUD (manual system) ─────────────────────────────────────────────────

export async function getBills(householdId) {
  const snap = await getDocs(query(collection(db, 'Households', householdId, 'bills')));
  return snap.docs.map(d => normalizeBill(d.id, d.data()));
}

/** Backward-compat alias used by Dashboard / MatchReport */
export async function getGeneratedBills(householdId, month, year) {
  const bills = await getBills(householdId);
  if (!month && !year) return bills;
  return bills.filter(b => {
    const { month: bm, year: by } = getBillPeriodMonthYear(b);
    return bm === month && by === year;
  });
}

export async function addBill(householdId, billData) {
  const ref = doc(collection(db, 'Households', householdId, 'bills'));
  const amt = Number(billData.amount) || 0;
  const obj = {
    id: ref.id,
    householdId,
    providerId: billData.providerId,
    amount: amt,
    lateFee: Number(billData.lateFee) || 0,
    billingPeriod: billData.billingPeriod,
    dueDate: billData.dueDate || '',
    transactionIds: [],
    totalPaid: 0,
    status: computeBillStatus(amt, Number(billData.lateFee) || 0, 0, billData.dueDate),
    notes: billData.notes || '',
    createdAt: new Date().toISOString(),
  };
  await setDoc(ref, obj);
  return obj;
}

export async function updateBill(householdId, billId, updates) {
  const ref  = doc(db, 'Households', householdId, 'bills', billId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const cur      = snap.data();
  const newAmt    = updates.amount  !== undefined ? Number(updates.amount)  : (cur.amount   || 0);
  const newLateFee = updates.lateFee !== undefined ? Number(updates.lateFee) : (cur.lateFee  || 0);
  const newDue    = updates.dueDate !== undefined ? updates.dueDate          : (cur.dueDate  || '');
  const newPaid   = cur.totalPaid || 0;
  await setDoc(ref, { ...updates, amount: newAmt, status: computeBillStatus(newAmt, newLateFee, newPaid, newDue) }, { merge: true });
}

export async function deleteBill(householdId, billId) {
  const ref  = doc(db, 'Households', householdId, 'bills', billId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const bill  = snap.data();
  const txIds = bill.transactionIds || [];

  if (txIds.length > 0) {
    const batch = writeBatch(db);
    txIds.forEach(txId => {
      batch.update(doc(db, 'Households', householdId, 'transactions', txId), {
        billIds: arrayRemove(billId),
        billId: null,
      });
    });
    batch.delete(ref);
    await batch.commit();
  } else {
    await deleteDoc(ref);
  }
}

/**
 * Link a transaction to a bill (many-to-many).
 * paidAmount = how much of the transaction amount goes to this bill.
 */
export async function linkTransactionToBill(householdId, billId, txId, paidAmount) {
  const billRef = doc(db, 'Households', householdId, 'bills', billId);
  const txRef   = doc(db, 'Households', householdId, 'transactions', txId);
  const [billSnap, txSnap] = await Promise.all([getDoc(billRef), getDoc(txRef)]);
  if (!billSnap.exists() || !txSnap.exists()) return;

  const bill = billSnap.data();
  const tx   = txSnap.data();

  // Prevent double-linking
  if ((bill.transactionIds || []).includes(txId)) return;

  const amount       = Number(paidAmount) || 0;
  const newTotalPaid = (bill.totalPaid || 0) + amount;
  const newStatus    = computeBillStatus(bill.amount || 0, bill.lateFee || 0, newTotalPaid, bill.dueDate);

  // Merge existing billIds (handles legacy billId field)
  const existingBillIds = tx.billIds || (tx.billId ? [tx.billId] : []);
  const newBillIds = [...new Set([...existingBillIds, billId])];

  // Build a per-bill paid-amount map on the transaction (for partial splitting traceability)
  const txBillAmounts = tx.billAmounts || {};
  txBillAmounts[billId] = amount;

  const batch = writeBatch(db);
  batch.update(billRef, {
    transactionIds: arrayUnion(txId),
    totalPaid:      newTotalPaid,
    status:         newStatus,
    // linkAmounts stores how much each transaction paid toward this bill
    [`linkAmounts.${txId}`]: amount,
  });
  batch.update(txRef, {
    billIds:      newBillIds,
    billId:       newBillIds[0],   // keep for backward compat
    status:       'cleared',
    billAmounts:  txBillAmounts,   // { billId -> amount } map on the transaction
    // actualAmount = total across all linked bills
    actualAmount: Object.values(txBillAmounts).reduce((s, v) => s + v, 0),
  });
  await batch.commit();
}

/**
 * Unlink a transaction from a specific bill.
 */
export async function unlinkTransactionFromBill(householdId, billId, txId) {
  const billRef = doc(db, 'Households', householdId, 'bills', billId);
  const txRef   = doc(db, 'Households', householdId, 'transactions', txId);
  const [billSnap, txSnap] = await Promise.all([getDoc(billRef), getDoc(txRef)]);
  if (!billSnap.exists() || !txSnap.exists()) return;

  const bill = billSnap.data();
  const tx   = txSnap.data();

  // Use linkAmounts map (new) or fallback to billAmounts on tx, then actualAmount
  const linkAmounts = bill.linkAmounts || {};
  const txBillAmounts = tx.billAmounts || {};
  const paidForThisBill = linkAmounts[txId] ?? txBillAmounts[billId] ?? (tx.actualAmount || 0);

  const newTotalPaid  = Math.max(0, (bill.totalPaid || 0) - paidForThisBill);
  const newBillStatus = computeBillStatus(bill.amount || 0, bill.lateFee || 0, newTotalPaid, bill.dueDate);

  const existingBillIds = tx.billIds || (tx.billId ? [tx.billId] : []);
  const newBillIds = existingBillIds.filter(id => id !== billId);

  // Remove this billId from tx.billAmounts
  const newTxBillAmounts = { ...txBillAmounts };
  delete newTxBillAmounts[billId];

  // Recompute actualAmount as sum of remaining bill amounts
  const newActualAmount = Object.values(newTxBillAmounts).reduce((s, v) => s + v, 0);

  const batch = writeBatch(db);

  batch.update(billRef, {
    transactionIds: arrayRemove(txId),
    totalPaid: newTotalPaid,
    status: newBillStatus,
    [`linkAmounts.${txId}`]: deleteField(),
  });
  batch.update(txRef, {
    billIds:      newBillIds,
    billId:       newBillIds[0] || null,
    billAmounts:  newTxBillAmounts,
    actualAmount: newActualAmount,
    status:       newBillIds.length > 0 ? 'cleared' : 'pending_classification',
  });
  await batch.commit();
}

// ── Bill Period Helpers (shared, used in UI too) ──────────────────────────────

export function getBillPeriodMonthYear(bill) {
  const bp = bill.billingPeriod;
  if (!bp) return { month: bill.month, year: bill.year };
  if (bp.type === 'month')        return { month: bp.month, year: bp.year };
  if (bp.type === 'dateRange')    { const d = new Date(bp.dateFrom); return { month: d.getMonth()+1, year: d.getFullYear() }; }
  if (bp.type === 'specificDate') { const d = new Date(bp.specificDate); return { month: d.getMonth()+1, year: d.getFullYear() }; }
  return { month: new Date().getMonth()+1, year: new Date().getFullYear() };
}

const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function getBillPeriodLabel(bill) {
  const bp = bill.billingPeriod;
  if (!bp) return `${MO[(bill.month||1)-1]} ${bill.year}`;
  if (bp.type === 'month') return `${MO[(bp.month||1)-1]} ${bp.year}`;
  if (bp.type === 'dateRange') {
    const fmt = (s) => new Date(s).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    return `${fmt(bp.dateFrom)} – ${fmt(bp.dateTo)}`;
  }
  if (bp.type === 'specificDate') {
    return new Date(bp.specificDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }
  return '—';
}

// ── Transaction CRUD ──────────────────────────────────────────────────────────

export async function getTransactions(householdId, month, year) {
  let snap;
  if (month && year) {
    snap = await getDocs(query(
      collection(db, 'Households', householdId, 'transactions'),
      where('month', '==', month), where('year', '==', year)
    ));
  } else {
    snap = await getDocs(query(collection(db, 'Households', householdId, 'transactions')));
  }
  return snap.docs.map(d => {
    const data = d.data();
    // Normalize: ensure billIds array exists
    if (!data.billIds) {
      data.billIds = data.billId ? [data.billId] : [];
    }
    return { id: d.id, ...data };
  });
}

export async function saveTransaction(householdId, billId, transactionData) {
  const txId  = transactionData.id || `manual_${billId}_${transactionData.year}_${transactionData.month}`;
  const txRef = doc(db, 'Households', householdId, 'transactions', txId);
  const obj   = {
    id: txId, householdId,
    billId: billId || null,
    billIds: billId ? [billId] : [],
    ...transactionData,
  };
  await setDoc(txRef, obj, { merge: true });
  return obj;
}

export async function saveBulkTransactions(householdId, transactions) {
  const batch = writeBatch(db);
  transactions.forEach(tx => {
    batch.set(doc(db, 'Households', householdId, 'transactions', tx.id), tx, { merge: true });
  });
  await batch.commit();
}

export async function updateTransaction(householdId, transactionId, updates) {
  await setDoc(doc(db, 'Households', householdId, 'transactions', transactionId), updates, { merge: true });
}

export async function updateBulkTransactions(householdId, updatesArray) {
  const batch = writeBatch(db);
  updatesArray.forEach(({ id, updates }) => {
    batch.set(doc(db, 'Households', householdId, 'transactions', id), updates, { merge: true });
  });
  await batch.commit();
}

export async function deleteTransaction(householdId, transactionId) {
  await deleteDoc(doc(db, 'Households', householdId, 'transactions', transactionId));
}
