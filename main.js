import './style.css'

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  setDoc, addDoc, 
  onSnapshot, getDocs,
  getDoc, updateDoc, doc,
  deleteDoc
} from "firebase/firestore";
import shortid from 'shortid'

// Global states
const servers = {
  iceServers: [
    {
      urls: [ 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19032' ]
    }
  ],
  iceCandidatePoolSize: 10
}

let pc = new RTCPeerConnection(servers);

let localStream = null
let remoteStream = null

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBJV",
  authDomain: "webrc",
  projectId: "webrct",
  storageBucket: "webrct",
  messagingSenderId: "13123",
  appId: "1:63"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore();

// Selectors
const webcamButton = document.querySelector('#webcamButton')
const webcamVideo = document.querySelector('#webcamVideo')
const callButton = document.querySelector('#callButton')
const callInput = document.querySelector('#callInput')
const answerButton = document.querySelector('#answerButton')
const remoteVideo = document.querySelector('#remoteVideo')
const hangupButton = document.querySelector('#hangupButton')

// Manejar la camara de local
webcamButton.onclick = async () => {

  webcamVideo.setAttribute('autoplay', '');
  webcamVideo.setAttribute('muted', '');
  webcamVideo.setAttribute('playsinline', '');

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  })

  remoteStream = new MediaStream()

  // push tracks from local to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream)
  })

  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track)
    })
  }

  webcamVideo.srcObject = localStream
  remoteVideo.srcObject = remoteStream
}

callButton.onclick = async () => {

  // Get candidates for caller, save to db
  pc.onicecandidate = event => {
    event.candidate && addDoc(collection(db, 'offerCandidates'), event.candidate.toJSON())
  }

  // createOffer
  const offerDescription = await pc.createOffer()
  await pc.setLocalDescription(offerDescription)

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type
  }

  const id = shortid.generate()
  callInput.value = id

  await setDoc(doc(db, 'calls', id), { offer })

  // Listen for remote answer
  onSnapshot(doc(db, 'calls', id), (doc) => {

    const data = doc.data()

    if (!pc.currentRemoteDescription && data?.answer) {

      const answerDescription = new RTCSessionDescription(data.answer)
      pc.setRemoteDescription(answerDescription)

    }

  })

  // When answered, add candidate to peer connection
  onSnapshot(collection(db, 'answerCandidates'), (snap) => {

    snap.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data())
        pc.addIceCandidate(candidate)
      }
    })

  })

}

// Answer the call with the unique Id
answerButton.onclick = async () => {

  const callID = callInput.value
  const docRef = doc(db, 'calls', callID)
  const callDoc = await getDoc(docRef)

  pc.onicecandidate = event => {
    event.candidate && addDoc(collection(db, 'answerCandidates'), event.candidate.toJSON())
  }

  const callData = callDoc.data()

  const offerDescription = callData.offer
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription))

  const answerDescription = await pc.createAnswer()
  await pc.setLocalDescription(answerDescription)

  const answer = {
    sdp: answerDescription.sdp,
    type: answerDescription.type
  }

  await updateDoc(docRef, { answer })

  onSnapshot(collection(db, 'offerCandidates'), (snap) => {

    snap.docChanges().forEach((change) => {
      if (change.type === 'added') {
        if ( change.type === 'added') {
          let data = change.doc.data()
          pc.addIceCandidate(new RTCIceCandidate(data))
        }
      }
    })

  })
}

hangupButton.onclick = async () => {

  const traks = webcamVideo.srcObject.getTracks()
  traks.forEach(track => {
    track.stop()
  })

  if (remoteStream){
    remoteStream.getTracks().forEach(traks => traks.stop())
  }

  if (pc) {
    pc.close()
  }

  webcamVideo.srcObject = null
  remoteVideo.srcObject = null

  const callID = callInput.value
  const docRef = doc(db, 'calls', callID)
  
  const offers = await getDocs(collection(db, 'offerCandidates'))
  offers.forEach(async (snap) => {
    const ref = doc(db, 'offerCandidates', snap.id)
    await deleteDoc(ref)
  })
  

  const answers = await getDocs(collection(db, 'answerCandidates'))
  answers.forEach(async (snap) => {
    const ref = doc(db, 'answerCandidates', snap.id)
    await deleteDoc(ref)
  })

  await deleteDoc(docRef)


}
