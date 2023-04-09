import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.1.1/firebase-app.js'
import { 
  getFirestore, 
  collection, 
  query, 
  getDocs, 
  doc, 
  updateDoc, 
  addDoc, 
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.1.1/firebase-firestore.js"

const firebaseConfig = {
  apiKey: config.API_KEY,
  authDomain: config.AUTH_DOMAIN,
  projectId: config.PROJECT_ID,
  storageBucket: config.STORAGE_BUCKET,
  messagingSenderId: config.MESSAGING_SENDER_ID,
  appId: config.APP_ID
};

const firebaseApp = initializeApp(firebaseConfig)
const db = getFirestore(firebaseApp)

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.1.google.com:19302', 'stun:stun2.1.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
}

// Global State
let pc = new RTCPeerConnection(servers)
let localStream = null
let remoteStream = null

const webcamButton = document.getElementById('webcamButton')
const webcamVideo = document.getElementById('webcamVideo')
const callButton = document.getElementById('callButton')
const callInput = document.getElementById('callInput')
const answerButton = document.getElementById('answerButton')
const remoteVideo = document.getElementById('remoteVideo')
const hangupButton = document.getElementById('hangupButton')

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  remoteStream = new MediaStream()
  localStream.getTracks().forEach( track => {
    pc.addTrack(track, localStream)
  })
  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track)
    })
  }
  webcamVideo.srcObject = localStream
  remoteVideo.srcObject = remoteStream

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
}

callButton.onclick = async () => {

  const q = query(collection(db, 'calls'))
  const res = await getDocs(q)
  const callDoc = res.docs[0]
  callInput.value = callDoc.id
  const answerCandidates = query(collection(db, 'answerCandidates'))

  pc.onicecandidate = event => {
    event.candidate && addDoc(collection(db, "offerCandidates"), event.candidate.toJSON())
  }
  const offerDescription = await pc.createOffer()
  await pc.setLocalDescription(offerDescription)
  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type
  }
 
  await updateDoc(doc(db, "calls", callDoc.id), {
    offer
  });
  

  onSnapshot(doc(db, "calls", callDoc.id), snapshot => {
    const data = snapshot.data()
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer)
      pc.setRemoteDescription(answerDescription)
    }
  })

  onSnapshot(answerCandidates, (querySnapshot) => {
    querySnapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data())
        pc.addIceCandidate(candidate)
      }
    })
  })

}

answerButton.onclick = async () => {

  const callId = callInput.value
  const q = query(collection(db, 'calls'))
  const res = await getDocs(q)
  const callDoc = res.docs[0]
  callInput.value = callDoc.id
  const offerCandidates = query(collection(db, 'offerCandidates'))

  pc.onicecandidate = (event) => {
    event.candidate && addDoc(collection(db, "answerCandidates"), event.candidate.toJSON());
  };

  const callData = callDoc.data()

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await updateDoc(doc(db, "calls", callId), {
    answer
  });

  onSnapshot(offerCandidates, (querySnapshot) => {
    querySnapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data())
        pc.addIceCandidate(candidate)
      }
    })
  })

}