import { db } from './firebase';
import { collection, doc, setDoc, getDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';

export async function getUserProfile(uid) {
  const docRef = doc(db, 'Users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data();
  }
  return null;
}

export async function createUserProfile(user) {
  const userRef = doc(db, 'Users', user.uid);
  const userData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || '',
    householdId: null
  };
  await setDoc(userRef, userData, { merge: true });
  return userData;
}

export async function updateUserProfileName(uid, displayName) {
  const userRef = doc(db, 'Users', uid);
  await updateDoc(userRef, { displayName });
}

function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function createHousehold(uid, householdName, trackingStartDate) {
  const newHouseholdRef = doc(collection(db, 'Households'));
  const joinCode = generateJoinCode();
  
  const householdData = {
    id: newHouseholdRef.id,
    name: householdName,
    joinCode: joinCode,
    trackingStartDate: trackingStartDate || `${new Date().getFullYear()}-01`,
    createdAt: new Date().toISOString()
  };
  
  await setDoc(newHouseholdRef, householdData);
  
  // Update user with the new householdId
  await updateDoc(doc(db, 'Users', uid), {
    householdId: newHouseholdRef.id
  });
  
  return householdData;
}

export async function joinHousehold(uid, joinCode) {
  const q = query(collection(db, 'Households'), where("joinCode", "==", joinCode));
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) {
    throw new Error("Invalid join code. Household not found.");
  }
  
  const householdData = querySnapshot.docs[0].data();
  
  await updateDoc(doc(db, 'Users', uid), {
    householdId: householdData.id
  });
  
  return householdData;
}

export async function getHousehold(householdId) {
  if (!householdId) return null;
  const docRef = doc(db, 'Households', householdId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
}

export async function getHouseholdUsers(householdId) {
  if (!householdId) return [];
  const q = query(collection(db, 'Users'), where("householdId", "==", householdId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data());
}
