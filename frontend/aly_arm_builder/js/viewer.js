/**
 * viewer.js
 *
 * Controls the 3D Robot Viewer modal.
 *
 * Backend contract:
 *   POST <endpoint>
 *   Content-Type: text/xml
 *   Body: raw xacro XML string
 *
 *   Response JSON — one of:
 *     { "url":  "http://..."  }  → loaded in iframe.src
 *     { "html": "<html>..."  }  → loaded in iframe.srcdoc
 *     { "error": "message"   }  → shown as error state
 */
import * as THREE from 'https://esm.sh/three@0.152.2';
import { OrbitControls } from 'https://esm.sh/three@0.152.2/examples/jsm/controls/OrbitControls.js';
import { ColladaLoader } from 'https://esm.sh/three@0.152.2/examples/jsm/loaders/ColladaLoader.js';
import URDFLoader from 'https://esm.sh/urdf-loader@0.12.0';

let scene, camera, renderer, controls;

function openViewer() {
  if (chain.length === 0) { showToast('BUILD A CHAIN FIRST'); return; }
  document.getElementById('viewer-modal').classList.add('open');
  _resetViewerState();
}

function closeViewer(e) {
  if (!e || e.target === document.getElementById('viewer-modal')) closeViewerDirect();
}

function closeViewerDirect() {
  document.getElementById('viewer-modal').classList.remove('open');
  _resetViewerState();
}

function _resetViewerState() {
  _vwShow('placeholder');
  if (window._currentRobot) {
    scene.remove(window._currentRobot);
    window._currentRobot = null;
  }
}

function _vwShow(state) {
  document.getElementById('vw-placeholder').style.display = state === 'placeholder' ? '' : 'none';
  document.getElementById('vw-loading').classList.toggle('active', state === 'loading');
  document.getElementById('vw-error').classList.toggle('active',   state === 'error');
  document.getElementById('viewer').classList.toggle('active', state === 'viewer');
}

async function sendToViewer() {
  const endpoint = document.getElementById('vw-endpoint').value.trim();
  if (!endpoint) { showToast('SET AN ENDPOINT FIRST'); return; }

  _vwShow('loading');

  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'text/xml' },
      body:    buildXacro(),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (!data.urdf)
      throw new Error('Backend returned no URDF');

    loadURDF(data.urdf);

    _vwShow('viewer');
    showToast('VIEWER CONNECTED');
  } catch (err) {
    document.getElementById('vw-error-msg').textContent = err.message;
    _vwShow('error');
    showToast('VIEWER ERROR');
  }
}

function loadURDF(urdfString) {

  const container = document.getElementById('viewer');

  if (!renderer) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111418);

    camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.01,
      100
    );
    camera.position.set(0.5, 0.5, 0.5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);

    scene.add(new THREE.AmbientLight(0x888888));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    scene.add(light);

    animate();
  }

  // Remove previous robot objects only
  scene.children
  if (window._currentRobot) {
    scene.remove(window._currentRobot);
    window._currentRobot = null;
  }

  const loader = new URDFLoader();
  loader.packages = {};

  loader.loadMeshCb = (path, manager, done) => {
    const colladaLoader = new ColladaLoader();
    colladaLoader.load(path, collada => {
      done(collada.scene);
    });
  };

  const robot = loader.parse(urdfString);
  scene.add(robot);
  window._currentRobot = robot;
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

window.openViewer = openViewer;
window.closeViewer = closeViewer;
window.sendToViewer = sendToViewer;
window.closeViewerDirect = closeViewerDirect;