/*
this file contains the main game logic tying together the managers.
general game logic goes here.
*/

import * as THREE from 'three';
// import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import physx from './physx.js';
import cameraManager from './camera-manager.js';
// import uiManager from './ui-manager.js';
import ioManager from './io-manager.js';
// import {loginManager} from './login.js';
// import physicsManager from './physics-manager.js';
import dioramaManager from './diorama.js';
import {world} from './world.js';
// import * as universe from './universe.js';
import {buildMaterial, highlightMaterial, selectMaterial, hoverMaterial, hoverEquipmentMaterial} from './shaders.js';
import {teleportMeshes} from './teleport.js';
import {getRenderer, sceneLowPriority, camera} from './renderer.js';
import {downloadFile, snapPosition, getDropUrl, handleDropJsonItem} from './util.js';
import {maxGrabDistance, throwReleaseTime, storageHost, minFov, maxFov} from './constants.js';
// import easing from './easing.js';
// import {VoicePack} from './voice-pack-voicer.js';
// import {VoiceEndpoint} from './voice-endpoint-voicer.js';
import metaversefileApi from './metaversefile-api.js';
// import metaversefileConstants from 'metaversefile/constants.module.js';
import * as metaverseModules from './metaverse-modules.js';
import loadoutManager from './loadout-manager.js';
// import soundManager from './sound-manager.js';

// const {contractNames} = metaversefileConstants;

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localVector4 = new THREE.Vector3();
const localVector5 = new THREE.Vector3();
const localVector6 = new THREE.Vector3();
// const localVector2D = new THREE.Vector2();
const localQuaternion = new THREE.Quaternion();
const localQuaternion2 = new THREE.Quaternion();
const localQuaternion3 = new THREE.Quaternion();
const localEuler = new THREE.Euler();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const localMatrix3 = new THREE.Matrix4();
// const localBox = new THREE.Box3();
const localRay = new THREE.Ray();
// const localRaycaster = new THREE.Raycaster();

// const oneVector = new THREE.Vector3(1, 1, 1);

// const cubicBezier = easing(0, 1, 0, 1);

const _getGrabAction = i => {
  const targetHand = i === 0 ? 'left' : 'right';
  const localPlayer = metaversefileApi.useLocalPlayer();
  const grabAction = localPlayer.findAction(action => action.type === 'grab' && action.hand === targetHand);
  return grabAction;
};
const _getGrabbedObject = i => {
  const grabAction = _getGrabAction(i);
  const grabbedObjectInstanceId = grabAction?.instanceId;
  const result = grabbedObjectInstanceId ? metaversefileApi.getAppByInstanceId(grabbedObjectInstanceId) : null;
  return result;
};

// returns whether we actually snapped
function updateGrabbedObject(o, grabMatrix, offsetMatrix, {collisionEnabled, handSnapEnabled, physx, gridSnap}) {
  grabMatrix.decompose(localVector, localQuaternion, localVector2);
  offsetMatrix.decompose(localVector3, localQuaternion2, localVector4);
  const offset = localVector3.length();
  localMatrix.multiplyMatrices(grabMatrix, offsetMatrix)
    .decompose(localVector5, localQuaternion3, localVector6);

  /* const grabbedObject = _getGrabbedObject(0);
  const grabbedPhysicsObjects = grabbedObject ? grabbedObject.getPhysicsObjects() : [];
  for (const physicsObject of grabbedPhysicsObjects) {
    physx.physxWorker.disableGeometryQueriesPhysics(physx.physics, physicsObject.physicsId);
  } */

  let collision = collisionEnabled && physx.physxWorker.raycastPhysics(physx.physics, localVector, localQuaternion);
  if (collision) {
    // console.log('got collision', collision);
    const {point} = collision;
    o.position.fromArray(point)
      // .add(localVector2.set(0, 0.01, 0));

    if (o.position.distanceTo(localVector) > offset) {
      collision = null;
    }
  }
  if (!collision) {
    o.position.copy(localVector5);
  }

  /* for (const physicsObject of grabbedPhysicsObjects) {
    physx.physxWorker.enableGeometryQueriesPhysics(physx.physics, physicsObject.physicsId);
  } */

  const handSnap = !handSnapEnabled || offset >= maxGrabDistance || !!collision;
  if (handSnap) {
    snapPosition(o, gridSnap);
    o.quaternion.setFromEuler(o.savedRotation);
  } else {
    o.quaternion.copy(localQuaternion3);
  }

  return {
    handSnap,
  };
}

const _makeTargetMesh = (() => {
  const targetMeshGeometry = (() => {
    const targetGeometry = BufferGeometryUtils.mergeBufferGeometries([
      new THREE.BoxBufferGeometry(0.03, 0.2, 0.03)
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0, -0.1, 0)),
      new THREE.BoxBufferGeometry(0.03, 0.2, 0.03)
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0.1)),
      new THREE.BoxBufferGeometry(0.03, 0.2, 0.03)
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0.1, 0, 0)),
    ]);
    return BufferGeometryUtils.mergeBufferGeometries([
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeTranslation(-0.5, 0.5, -0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(-0.5, -0.5, -0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(-0.5, 0.5, 0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0.5, 0.5, -0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))))
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0.5, 0.5, 0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))))
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(-0.5, -0.5, 0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))))
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0.5, -0.5, -0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 1, 0).normalize(), new THREE.Vector3(1, 1, 0).normalize())))
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0).normalize(), new THREE.Vector3(0, 0, -1).normalize())))
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0).normalize(), new THREE.Vector3(0, 1, 0).normalize())))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0.5, -0.5, 0.5)),
    ])// .applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.5, 0));
  })();
  const targetVsh = `
    #define M_PI 3.1415926535897932384626433832795
    uniform float uTime;
    // varying vec2 vUv;
    void main() {
      float f = 1.0 + sign(uTime) * pow(sin(abs(uTime) * M_PI), 0.5) * 0.2;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position * f, 1.);
    }
  `;
  const targetFsh = `
    uniform float uHighlight;
    uniform float uTime;
    
    const vec3 c = vec3(${new THREE.Color(0x29b6f6).toArray().join(', ')});
    
    void main() {
      float f = max(1.0 - sign(uTime) * pow(abs(uTime), 0.5), 0.1);
      gl_FragColor = vec4(vec3(c * f * uHighlight), 1.0);
    }
  `;
  return p => {
    const geometry = targetMeshGeometry;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uHighlight: {
          type: 'f',
          value: 0,
          needsUpdate: true,
        },
        uTime: {
          type: 'f',
          value: 0,
          needsUpdate: true,
        },
      },
      vertexShader: targetVsh,
      fragmentShader: targetFsh,
      // transparent: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  };
})();
const _makeHighlightPhysicsMesh = material => {
  const geometry = new THREE.BoxBufferGeometry(1, 1, 1);
  material = material.clone();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.physicsId = 0;
  return mesh;
};

/* const highlightMesh = _makeTargetMesh();
highlightMesh.visible = false;
sceneLowPriority.add(highlightMesh);
let highlightedObject = null; */

const highlightPhysicsMesh = _makeHighlightPhysicsMesh(buildMaterial);
highlightPhysicsMesh.visible = false;
sceneLowPriority.add(highlightPhysicsMesh);
let highlightedPhysicsObject = null;
let highlightedPhysicsId = 0;

const mouseHighlightPhysicsMesh = _makeHighlightPhysicsMesh(highlightMaterial);
mouseHighlightPhysicsMesh.visible = false;
sceneLowPriority.add(mouseHighlightPhysicsMesh);
let mouseHoverObject = null;
let mouseHoverPhysicsId = 0;
let mouseHoverPosition = null;

const mouseSelectPhysicsMesh = _makeHighlightPhysicsMesh(selectMaterial);
mouseSelectPhysicsMesh.visible = false;
sceneLowPriority.add(mouseSelectPhysicsMesh);
let mouseSelectedObject = null;
let mouseSelectedPhysicsId = 0;
let mouseSelectedPosition = null;

const mouseDomHoverPhysicsMesh = _makeHighlightPhysicsMesh(hoverMaterial);
mouseDomHoverPhysicsMesh.visible = false;
sceneLowPriority.add(mouseDomHoverPhysicsMesh);
let mouseDomHoverObject = null;
let mouseDomHoverPhysicsId = 0;

const mouseDomEquipmentHoverPhysicsMesh = _makeHighlightPhysicsMesh(hoverEquipmentMaterial);
mouseDomEquipmentHoverPhysicsMesh.visible = false;
sceneLowPriority.add(mouseDomEquipmentHoverPhysicsMesh);
let mouseDomEquipmentHoverObject = null;
let mouseDomEquipmentHoverPhysicsId = 0;

// let selectedLoadoutIndex = -1;

const _use = () => {
  if (gameManager.getMenu() === 3) {
    const itemSpec = itemSpecs3[selectedItemIndex];
    let {start_url, filename, content} = itemSpec;

    if (start_url) {
      // start_url = new URL(start_url, srcUrl).href;
      // filename = start_url;
    } else if (filename && content) {
      const blob = new Blob([content], {
        type: 'application/octet-stream',
      });
      start_url = URL.createObjectURL(blob);
      start_url += '/' + filename;
    }
    world.appManager.addTrackedApp(start_url, null, deployMesh.position, deployMesh.quaternion, deployMesh.scale);

    gameManager.setMenu(0);
    cameraManager.requestPointerLock();
  } else if (highlightedObject /* && !editedObject */) {
    _grab(highlightedObject);
    highlightedObject = null;
    
    gameManager.setMenu(0);
    cameraManager.requestPointerLock();
  } else if (gameManager.getMenu() === 1) {
    const itemSpec = itemSpecs1[selectedItemIndex];
    itemSpec.cb();
  } else if (gameManager.getMenu() === 2) {
    const inventory = loginManager.getInventory();
    const itemSpec = inventory[selectedItemIndex];

    world.appManager.addTrackedApp(itemSpec.id, null, deployMesh.position, deployMesh.quaternion, deployMesh.scale);

    gameManager.setMenu(0);
    cameraManager.requestPointerLock();
  }
};
const _delete = () => {
  const grabbedObject = _getGrabbedObject(0);
  if (grabbedObject) {
    const localPlayer = metaversefileApi.useLocalPlayer();
    localPlayer.ungrab();
    
    world.appManager.removeTrackedApp(grabbedObject.instanceId);

  } else if (highlightedPhysicsObject) {
    world.appManager.removeTrackedApp(highlightedPhysicsObject.instanceId);
    highlightedPhysicsObject = null;

  } else if (mouseSelectedObject) {
    world.appManager.removeTrackedApp(mouseSelectedObject.instanceId);
    
    if (mouseHoverObject === mouseSelectedObject) {
      gameManager.setMouseHoverObject(null);
    }
    gameManager.setMouseSelectedObject(null);
  }
};
const _click = () => {
  if (_getGrabbedObject(0)) {
    const localPlayer = metaversefileApi.useLocalPlayer();
    localPlayer.ungrab();
  } else {
    if (highlightedPhysicsObject) {
      _grab(highlightedPhysicsObject);
    }
  }
};
let lastUseIndex = 0;
const _getNextUseIndex = animationCombo => {
  if (Array.isArray(animationCombo)) {
    return (lastUseIndex++) % animationCombo.length;
  } else {
    return 0;
  }
}
const _startUse = () => {
  const localPlayer = metaversefileApi.useLocalPlayer();
  const wearApp = loadoutManager.getSelectedApp();
  if (wearApp) {
    const useComponent = wearApp.getComponent('use');
    if (useComponent) {
      const useAction = localPlayer.getAction('use');
      if (!useAction) {
        const {instanceId} = wearApp;
        const {boneAttachment, animation, animationCombo, animationEnvelope, ik, behavior, position, quaternion, scale} = useComponent;
        const index = _getNextUseIndex(animationCombo);
        const newUseAction = {
          type: 'use',
          instanceId,
          animation,
          animationCombo,
          animationEnvelope,
          ik,
          behavior,
          boneAttachment,
          index,
          position,
          quaternion,
          scale,
        };
        // console.log('new use action', newUseAction, useComponent, {animation, animationCombo, animationEnvelope});
        localPlayer.addAction(newUseAction);

        wearApp.use();
      }
    }
  }
};
const _endUse = () => {
  const localPlayer = metaversefileApi.useLocalPlayer();
  const useAction = localPlayer.getAction('use');
  if (useAction) {
    const app = metaversefileApi.getAppByInstanceId(useAction.instanceId);
    app.dispatchEvent({
      type: 'use',
      use: false,
    });
    localPlayer.removeAction('use');
  }
};
const _mousedown = () => {
  _startUse();
};
const _mouseup = () => {
  _endUse();
};

const _grab = object => {
  const localPlayer = metaversefileApi.useLocalPlayer();
  localPlayer.grab(object);
  
  gameManager.gridSnap = 0;
  gameManager.editMode = false;
};

const hitRadius = 1;
const hitHeight = 0.2;
const hitHalfHeight = hitHeight * 0.5;
const hitboxOffsetDistance = 0.3;
const damageMeshOffsetDistance = 1.5;
/* const cylinderMesh = (() => {
  const radius = 1;
  const height = 0.2;
  const halfHeight = height/2;
  const cylinderMesh = new THREE.Mesh(
    new THREE.CylinderBufferGeometry(radius, radius, height),
    new THREE.MeshBasicMaterial({
      color: 0x00FFFF,
    })
  );
  cylinderMesh.radius = radius;
  cylinderMesh.halfHeight = halfHeight;
  return cylinderMesh;
})(); */

let grabUseMesh = null;
const _gameInit = () => {
  grabUseMesh = metaversefileApi.createApp();
  (async () => {
    await metaverseModules.waitForLoad();
    const {modules} = metaversefileApi.useDefaultModules();
    const m = modules['button'];
    await grabUseMesh.addModule(m);
  })();
  grabUseMesh.targetApp = null;
  sceneLowPriority.add(grabUseMesh);
};
Promise.resolve()
  .then(_gameInit);

let lastDraggingRight = false;
let dragRightSpec = null;
let fovFactor = 0;
let lastActivated = false;
let lastThrowing = false;
let lastHitTimes = new WeakMap();
const _gameUpdate = (timestamp, timeDiff) => {
  const now = timestamp;
  const renderer = getRenderer();
  
  const localPlayer = metaversefileApi.useLocalPlayer();

  const _handlePush = () => {
    if (gameManager.canPush()) {
      if (ioManager.keys.forward) {
        gameManager.menuPush(-1);
      } else if (ioManager.keys.backward) {
        gameManager.menuPush(1);
      }
    }
  };
  _handlePush();

  const _updateActivateAnimation = grabUseMeshPosition => {
    let currentDistance = 100;
    let currentAnimation = "grab_forward";

    // Forward
    {
      localVector.set(0, -0.5, -0.5).applyQuaternion(localPlayer.quaternion)
        .add(localPlayer.position);
      const distance = grabUseMeshPosition.distanceTo(localVector);
      currentDistance = distance;
    }

    // Down
    {
      localVector.set(0, -1.2, -0.5).applyQuaternion(localPlayer.quaternion)
        .add(localPlayer.position);
      const distance = grabUseMeshPosition.distanceTo(localVector);
      if (distance < currentDistance) {
        currentDistance = distance;
        currentAnimation = "grab_down";
      }
    }

    // Up
    {
      localVector.set(0, 0.0, -0.5).applyQuaternion(localPlayer.quaternion)
        .add(localPlayer.position);
      const distance = grabUseMeshPosition.distanceTo(localVector);
      if (distance < currentDistance) {
        currentDistance = distance;
        currentAnimation = "grab_up";
      }
    }

    // Left
    {
      localVector.set(-0.8, -0.5, -0.5).applyQuaternion(localPlayer.quaternion)
        .add(localPlayer.position);
      const distance = grabUseMeshPosition.distanceTo(localVector);
      if (distance < currentDistance) {
        currentDistance = distance;
        currentAnimation = "grab_left";
      }
    }
    
    // Right
    {
      localVector.set(0.8, -0.5, -0.5).applyQuaternion(localPlayer.quaternion)
        .add(localPlayer.position);
      const distance = grabUseMeshPosition.distanceTo(localVector);
      if (distance < currentDistance) {
        currentDistance = distance;
        currentAnimation = "grab_right";
      }
    }

    if (localPlayer.getAction('activate')) {
      localPlayer.getAction('activate').animationName = currentAnimation;
    }

    // return (currentDistance < 0.8);
  };

  const _updateGrab = () => {
    // moveMesh.visible = false;

    const _isWear = o => localPlayer.findAction(action => action.type === 'wear' && action.instanceId === o.instanceId);

    for (let i = 0; i < 2; i++) {
      const grabAction = _getGrabAction(i);
      const grabbedObject = _getGrabbedObject(i);
      if (grabbedObject && !_isWear(grabbedObject)) {
        const {position, quaternion} = localPlayer.hands[i];
        localMatrix.compose(position, quaternion, localVector.set(1, 1, 1));
        
        grabbedObject.updateMatrixWorld();

        /* const {handSnap} = */updateGrabbedObject(grabbedObject, localMatrix, localMatrix3.fromArray(grabAction.matrix), {
          collisionEnabled: true,
          handSnapEnabled: true,
          physx,
          gridSnap: gameManager.getGridSnap(),
        });

        grabbedObject.updateMatrixWorld();
        
        grabUseMesh.position.copy(camera.position)
          .add(
            localVector.copy(grabbedObject.position)
              .sub(camera.position)
              .normalize()
              .multiplyScalar(3)
          );
        grabUseMesh.quaternion.copy(camera.quaternion);
        grabUseMesh.updateMatrixWorld();
        // grabUseMesh.visible = true;
        grabUseMesh.targetApp = grabbedObject;
        grabUseMesh.setComponent('value', localPlayer.actionInterpolants.activate.getNormalized());
      }
    }
    grabUseMesh.visible = false;
    if (!gameManager.editMode) {
      const avatarHeight = localPlayer.avatar ? localPlayer.avatar.height : 0;
      localVector.copy(localPlayer.position)
        .add(localVector2.set(0, avatarHeight * (1 - localPlayer.getCrouchFactor()) * 0.5, -0.3).applyQuaternion(localPlayer.quaternion));
        
      const radius = 1;
      const halfHeight = 0.1;
      const collision = physx.physxWorker.getCollisionObjectPhysics(physx.physics, radius, halfHeight, localVector, localPlayer.quaternion);
      if (collision) {
        const physicsId = collision.objectId;
        const object = metaversefileApi.getAppByPhysicsId(physicsId);
        const physicsObject = metaversefileApi.getPhysicsObjectByPhysicsId(physicsId);
        // console.log('got object', physicsId, object);
        if (object && !_isWear(object) && physicsObject) {
          grabUseMesh.position.setFromMatrixPosition(physicsObject.physicsMesh.matrixWorld);
          grabUseMesh.quaternion.copy(camera.quaternion);
          // grabUseMesh.scale.copy(grabbedObject.scale);
          grabUseMesh.updateMatrixWorld();
          //grabUseMesh.visible = true;
          grabUseMesh.targetApp = object;
          grabUseMesh.setComponent('value', localPlayer.actionInterpolants.activate.getNormalized());
          
          _updateActivateAnimation(grabUseMesh.position);
          grabUseMesh.visible = true;
        }
      }
    }
  };
  _updateGrab();

  const _handlePhysicsHighlight = () => {
    highlightedPhysicsObject = null;

    if (gameManager.editMode) {
      /* const grabbedObject = _getGrabbedObject(0);
      const grabbedPhysicsIds = (grabbedObject && grabbedObject.getPhysicsIds) ? grabbedObject.getPhysicsIds() : [];
      for (const physicsId of grabbedPhysicsIds) {
        // physx.physxWorker.disableGeometryPhysics(physx.physics, physicsId);
        physx.physxWorker.disableGeometryQueriesPhysics(physx.physics, physicsId);
      } */

      const {position, quaternion} = renderer.xr.getSession() ? metaversefileApi.useLocalPlayer().leftHand : camera;
      const collision = physx.physxWorker.raycastPhysics(physx.physics, position, quaternion);
      if (collision) {
        const physicsId = collision.objectId;
        highlightedPhysicsObject = metaversefileApi.getAppByPhysicsId(physicsId);
        highlightedPhysicsId = physicsId;
      }

      /* for (const physicsId of grabbedPhysicsIds) {
        // physx.physxWorker.enableGeometryPhysics(physx.physics, physicsId);
        physx.physxWorker.enableGeometryQueriesPhysics(physx.physics, physicsId);
      } */
    }
  };
  _handlePhysicsHighlight();

  const _updatePhysicsHighlight = () => {
    highlightPhysicsMesh.visible = false;

    if (highlightedPhysicsObject) {
      const physicsId = highlightedPhysicsId;

      highlightedPhysicsObject.updateMatrixWorld();

      const physicsObject = /*window.lolPhysicsObject ||*/ metaversefileApi.getPhysicsObjectByPhysicsId(physicsId);
      if (physicsObject) {
        const {physicsMesh} = physicsObject;
        highlightPhysicsMesh.geometry = physicsMesh.geometry;
        // highlightPhysicsMesh.matrix.copy(physicsObject.matrix);
        highlightPhysicsMesh.matrixWorld.copy(physicsMesh.matrixWorld)
          .decompose(highlightPhysicsMesh.position, highlightPhysicsMesh.quaternion, highlightPhysicsMesh.scale);
        // highlightPhysicsMesh.updateMatrixWorld();
        // window.highlightPhysicsMesh = highlightPhysicsMesh;
        highlightPhysicsMesh.material.uniforms.uTime.value = (now%1500)/1500;
        highlightPhysicsMesh.material.uniforms.uTime.needsUpdate = true;
        highlightPhysicsMesh.material.uniforms.uColor.value.setHex(buildMaterial.uniforms.uColor.value.getHex());
        highlightPhysicsMesh.material.uniforms.uColor.needsUpdate = true;
        highlightPhysicsMesh.visible = true;
        highlightPhysicsMesh.updateMatrixWorld();
      }
    }
  };
  _updatePhysicsHighlight();

  const _updateMouseHighlight = () => {
    mouseHighlightPhysicsMesh.visible = false;

    const h = mouseHoverObject;
    if (h && !gameManager.dragging) {
      const physicsId = mouseHoverPhysicsId;

      const physicsObject = metaversefileApi.getPhysicsObjectByPhysicsId(physicsId);
      if (physicsObject) {
        const {physicsMesh} = physicsObject;
        mouseHighlightPhysicsMesh.geometry = physicsMesh.geometry;
        localMatrix2.copy(physicsMesh.matrixWorld)
          // .premultiply(localMatrix3.copy(mouseHoverObject.matrixWorld).invert())
          .decompose(mouseHighlightPhysicsMesh.position, mouseHighlightPhysicsMesh.quaternion, mouseHighlightPhysicsMesh.scale);
        mouseHighlightPhysicsMesh.material.uniforms.uTime.value = (now%1500)/1500;
        mouseHighlightPhysicsMesh.material.uniforms.uTime.needsUpdate = true;
        mouseHighlightPhysicsMesh.visible = true;
        mouseHighlightPhysicsMesh.updateMatrixWorld();
      }
    }
  };
  _updateMouseHighlight();
  
  const _updateMouseSelect = () => {
    mouseSelectPhysicsMesh.visible = false;

    const o = mouseSelectedObject;
    if (o) {
      const physicsId = mouseSelectedPhysicsId;

      const physicsObject = metaversefileApi.getPhysicsObjectByPhysicsId(physicsId);
      if (physicsObject) {
        const {physicsMesh} = physicsObject;
        mouseSelectPhysicsMesh.geometry = physicsMesh.geometry;
        // window.geometry = mouseSelectPhysicsMesh.geometry;
        
        // update matrix
        {
          localMatrix2.copy(physicsMesh.matrixWorld)
            // .premultiply(localMatrix3.copy(mouseSelectedObject.matrixWorld).invert())
            .decompose(mouseSelectPhysicsMesh.position, mouseSelectPhysicsMesh.quaternion, mouseSelectPhysicsMesh.scale);
          // console.log('decompose', mouseSelectPhysicsMesh.position.toArray().join(','), mouseSelectPhysicsMesh.quaternion.toArray().join(','), mouseSelectPhysicsMesh.scale.toArray().join(','));
          // debugger;
          // mouseSelectPhysicsMesh.position.set(0, 0, 0);
          // mouseSelectPhysicsMesh.quaternion.identity();
          // mouseSelectPhysicsMesh.scale.set(1, 1, 1);
          mouseSelectPhysicsMesh.visible = true;
          mouseSelectPhysicsMesh.updateMatrixWorld();

        }
        // update uniforms
        {
          mouseSelectPhysicsMesh.material.uniforms.uTime.value = (now%1500)/1500;
          mouseSelectPhysicsMesh.material.uniforms.uTime.needsUpdate = true;
          
        }
      } /* else {
        console.warn('no physics transform for object', o, physicsId, physicsTransform);
      } */
    }
  };
  _updateMouseSelect();
  
  const _updateMouseDomHover = () => {
    mouseDomHoverPhysicsMesh.visible = false;

    if (mouseDomHoverObject && !mouseSelectedObject) {
      const physicsId = mouseDomHoverPhysicsId;

      const physicsObject = metaversefileApi.getPhysicsObjectByPhysicsId(physicsId);
      if (physicsObject) {
        const {physicsMesh} = physicsObject;
        mouseDomHoverPhysicsMesh.geometry = physicsMesh.geometry;
        localMatrix2.copy(physicsMesh.matrixWorld)
          // .premultiply(localMatrix3.copy(mouseHoverObject.matrixWorld).invert())
          .decompose(mouseDomHoverPhysicsMesh.position, mouseDomHoverPhysicsMesh.quaternion, mouseDomHoverPhysicsMesh.scale);
        mouseDomHoverPhysicsMesh.material.uniforms.uTime.value = (now%1500)/1500;
        mouseDomHoverPhysicsMesh.material.uniforms.uTime.needsUpdate = true;
        mouseDomHoverPhysicsMesh.visible = true;
        mouseDomHoverPhysicsMesh.updateMatrixWorld();
      }
    }
  };
  _updateMouseDomHover();
  
  const _updateMouseDomEquipmentHover = () => {
    mouseDomEquipmentHoverPhysicsMesh.visible = false;

    if (mouseDomEquipmentHoverObject && !mouseSelectedObject) {
      const physicsId = mouseDomEquipmentHoverPhysicsId;

      const physicsObject = metaversefileApi.getPhysicsObjectByPhysicsId(physicsId);
      if (physicsObject) {
        const {physicsMesh} = physicsObject;
        mouseDomEquipmentHoverPhysicsMesh.geometry = physicsMesh.geometry;
        localMatrix2.copy(physicsMesh.matrixWorld)
          // .premultiply(localMatrix3.copy(mouseHoverObject.matrixWorld).invert())
          .decompose(mouseDomEquipmentHoverPhysicsMesh.position, mouseDomEquipmentHoverPhysicsMesh.quaternion, mouseDomEquipmentHoverPhysicsMesh.scale);
        mouseDomEquipmentHoverPhysicsMesh.material.uniforms.uTime.value = (now%1500)/1500;
        mouseDomEquipmentHoverPhysicsMesh.material.uniforms.uTime.needsUpdate = true;
        mouseDomEquipmentHoverPhysicsMesh.visible = true;
        mouseDomEquipmentHoverPhysicsMesh.updateMatrixWorld();
      }
    }
  };
  _updateMouseDomEquipmentHover();

  const _handleTeleport = () => {
    if (localPlayer.avatar) {
      teleportMeshes[1].update(localPlayer.avatar.inputs.leftGamepad.position, localPlayer.avatar.inputs.leftGamepad.quaternion, ioManager.currentTeleport, (p, q) => physx.physxWorker.raycastPhysics(physx.physics, p, q), (position, quaternion) => {
        const localPlayer = metaversefileApi.useLocalPlayer();
        localPlayer.teleportTo(position, quaternion);
      });
    }
  };
  _handleTeleport();

  const _handleClosestObject = () => {
    const apps = world.appManager.apps;
    if (apps.length > 0) {
      let closestObject;
      
      if (!gameManager.getMouseSelectedObject() && !gameManager.contextMenu) {
        if (/*controlsManager.isPossessed() &&*/ cameraManager.getMode() !== 'firstperson') {
          localPlayer.matrixWorld.decompose(
            localVector,
            localQuaternion,
            localVector2
          );
          const avatarHeight = localPlayer.avatar ? localPlayer.avatar.height : 0;
          localVector.y -= avatarHeight / 2;
          const distanceSpecs = apps.map(object => {
            let distance = object.position.distanceTo(localVector);
            if (distance > 30) {
              distance = Infinity;
            }
            return {
              distance,
              object,
            };
          }).sort((a, b) => a.distance - b.distance);
          const closestDistanceSpec = distanceSpecs[0];
          if (isFinite(closestDistanceSpec.distance)) {
            closestObject = closestDistanceSpec.object;
          }
        } else {
          if ((!!localPlayer.avatar && /*controlsManager.isPossessed() &&*/ cameraManager.getMode()) === 'firstperson' || gameManager.dragging) {
            localRay.set(
              camera.position,
              localVector.set(0, 0, -1)
                .applyQuaternion(camera.quaternion)
            );
            
            const distanceSpecs = apps.map(object => {
              const distance =
                object.position.distanceTo(camera.position) < 8 ?
                  localRay.distanceToPoint(object.position)
                :
                  Infinity;
              return {
                distance,
                object,
              };
            }).sort((a, b) => a.distance - b.distance);
            const closestDistanceSpec = distanceSpecs[0];
            if (isFinite(closestDistanceSpec.distance)) {
              closestObject = closestDistanceSpec.object;
            }
          } else {
            closestObject = gameManager.getMouseHoverObject();
          }
        }
      } else {
        closestObject = null;
      }
      
      gameManager.closestObject = closestObject;
    }
  };
  _handleClosestObject();
  
  const _handleUsableObject = () => {
    const apps = world.appManager.apps;
    if (apps.length > 0) {
      let usableObject;
      
      if (
        !gameManager.getMouseSelectedObject() &&
        !gameManager.contextMenu /* &&
        controlsManager.isPossessed() */
      ) {
        localPlayer.matrixWorld.decompose(
          localVector,
          localQuaternion,
          localVector2
        );
        const avatarHeight = localPlayer.avatar ? localPlayer.avatar.height : 0;
        localVector.y -= avatarHeight / 2;
        const distanceSpecs = apps.map(object => {
          let distance = object.position.distanceTo(localVector);
          if (distance > 3) {
            distance = Infinity;
          }
          return {
            distance,
            object,
          };
        }).sort((a, b) => a.distance - b.distance);
        const closestDistanceSpec = distanceSpecs[0];
        if (isFinite(closestDistanceSpec.distance)) {
          usableObject = closestDistanceSpec.object;
        }
      } else {
        usableObject = null;
      }
      
      gameManager.usableObject = usableObject;
    }
  };
  _handleUsableObject();
  
  const _updateDrags = () => {
    const {draggingRight} = gameManager;
    if (draggingRight !== lastDraggingRight) {
      if (draggingRight) {
        const e = gameManager.getLastMouseEvent();
        if (e) {
          const {clientX, clientY} = e;
          const cameraStartPosition = camera.position.clone();
          
          dragRightSpec = {
            clientX,
            clientY,
            cameraStartPosition,
          };
        } else {
          dragRightSpec = null;
        }
      } else {
        dragRightSpec = null;
      }
    }
    lastDraggingRight = draggingRight;
  };
  _updateDrags();
  
  const _updateActivate = () => {
    const localPlayer = metaversefileApi.useLocalPlayer();
    const v = localPlayer.actionInterpolants.activate.getNormalized();
    const currentActivated = v >= 1;
    
    if (currentActivated && !lastActivated) {
      if (grabUseMesh.targetApp) {
        grabUseMesh.targetApp.activate();
      }
      localPlayer.removeAction('activate');
    }
    lastActivated = currentActivated;
  };
  _updateActivate();

  const _updateThrow = () => {
    const localPlayer = metaversefileApi.useLocalPlayer();
    const useAction = localPlayer.getAction('use');
    if (useAction && useAction.behavior === 'throw') {
      const v = localPlayer.actionInterpolants.use.get() / throwReleaseTime;
      const currentThrowing = v >= 1;

      if (currentThrowing && !lastThrowing) {
        // console.log('got throw action', useAction, localPlayer);

        const app = metaversefileApi.getAppByInstanceId(useAction.instanceId);
        localPlayer.unwear(app);
      }
      lastThrowing = currentThrowing;
    }
  };
  _updateThrow();

  const _updateBehavior = () => {
    const useAction = localPlayer.getAction('use');
    if (useAction) {
      const _handleSword = () => {
        localVector.copy(localPlayer.position)
          .add(localVector2.set(0, 0, -hitboxOffsetDistance).applyQuaternion(localPlayer.quaternion));

        const collision = physx.physxWorker.getCollisionObjectPhysics(
          physx.physics,
          hitRadius,
          hitHalfHeight,
          localVector,
          localPlayer.quaternion,
        );
        if (collision) {
          const collisionId = collision.objectId;
          const result = metaversefileApi.getPairByPhysicsId(collisionId);
          if (result) {
            const [app, physicsObject] = result;
            const lastHitTime = lastHitTimes.get(app) ?? 0;
            const timeDiff = now - lastHitTime;
            if (timeDiff > 1000) {
              const damage = typeof useAction.damage === 'number' ? useAction.damage : 10;
              const hitDirection = app.position.clone()
                .sub(localPlayer.position);
              hitDirection.y = 0;
              hitDirection.normalize();

              const hitPosition = localVector.copy(localPlayer.position)
                .add(localVector2.set(0, 0, -damageMeshOffsetDistance).applyQuaternion(localPlayer.quaternion))
                .clone();
              localEuler.setFromQuaternion(camera.quaternion, 'YXZ');
              localEuler.x = 0;
              localEuler.z = 0;
              const hitQuaternion = new THREE.Quaternion().setFromEuler(localEuler);

              // const willDie = app.willDieFrom(damage);
              app.hit(damage, {
                collisionId,
                physicsObject,
                hitPosition,
                hitQuaternion,
                hitDirection,
                // willDie,
              });
            
              lastHitTimes.set(app, now);
            }
          }
        }
      };

      switch (useAction.behavior) {
        case 'sword': {
          _handleSword();
          break;
        }
        default: {
          break;
        }
      }
    }
  };
  _updateBehavior();
  
  const _updateEyes = () => {
    if (localPlayer.avatar) {
      if (mouseSelectedObject && mouseSelectedPosition) {
        // console.log('got', mouseSelectedObject.position.toArray().join(','));
        localPlayer.avatar.eyeTarget.copy(mouseSelectedPosition);
        localPlayer.avatar.eyeTargetInverted = true;
        localPlayer.avatar.eyeTargetEnabled = true;
      } else if (!cameraManager.pointerLockElement && lastMouseEvent) {
        const renderer = getRenderer();
        const size = renderer.getSize(localVector);
        
        localPlayer.avatar.eyeTarget.set(-(lastMouseEvent.clientX/size.x-0.5), (lastMouseEvent.clientY/size.y-0.5), 1)
          .unproject(camera);
        localPlayer.avatar.eyeTargetInverted = false;
        localPlayer.avatar.eyeTargetEnabled = true;
      } else {
        localPlayer.avatar.eyeTargetEnabled = false;
      }
    }
  };
  _updateEyes();
  
  const updateFov = () => {
    if (!renderer.xr.getSession()) {
      const fovInTime = 3;
      const fovOutTime = 0.3;
      
      const narutoRun = localPlayer.getAction('narutoRun');
      if (narutoRun) {
        if (ioManager.lastNonzeroDirectionVector.z < 0) {    
          fovFactor += timeDiff / 1000 / fovInTime;
        } else {
          fovFactor -= timeDiff / 1000 / fovInTime;
        }
      } else {
        fovFactor -= timeDiff / 1000 / fovOutTime;
      }
      fovFactor = Math.min(Math.max(fovFactor, 0), 1);

      camera.fov = minFov + Math.pow(fovFactor, 0.75) * (maxFov - minFov);
      camera.updateProjectionMatrix();
    }
  };
  updateFov();

  const crosshairEl = document.getElementById('crosshair');
  if (crosshairEl) {
    const visible = !!cameraManager.pointerLockElement &&
      (['camera', 'firstperson', 'thirdperson'].includes(cameraManager.getMode()) || metaversefileApi.useLocalPlayer().hasAction('aim')) &&
      !_getGrabbedObject(0);
    crosshairEl.style.visibility = visible ? null : 'hidden';
  }
};
const _pushAppUpdates = () => {
  world.appManager.pushAppUpdates();
  
  /*const localPlayer = metaversefileApi.useLocalPlayer();
  localPlayer.appManager.pushAppUpdates();*/
  
  const remotePlayers = metaversefileApi.useRemotePlayers(); // Might have to be removed too
  for (const remotePlayer of remotePlayers) {
    remotePlayer.appManager.pushAppUpdates();
  }
};
const _pushPlayerUpdates = () => {
  const localPlayer = metaversefileApi.useLocalPlayer();
  localPlayer.pushPlayerUpdates();
};

const rotationSnap = Math.PI/6;

/* const metaverseUi = {
  makeArrowLoader() {
    const app = metaversefileApi.createApp();
    (async () => {
      await metaverseModules.waitForLoad();
      const {modules} = metaversefileApi.useDefaultModules();
      const m = modules['arrowLoader'];
      await app.addModule(m);
    })();
    return app;
  },
}; */

const _bindPointerLock = () => {
  cameraManager.addEventListener('pointerlockchange', e => {
    const {pointerLockElement} = e.data;

    gameManager.setMouseHoverObject(null);
    if (!pointerLockElement) {
      gameManager.editMode = false;
    }
  });
};
_bindPointerLock();

const _setFirstPersonAction = firstPerson => {
  const localPlayer = metaversefileApi.useLocalPlayer();
  if (firstPerson) {
    if (!localPlayer.hasAction('firstperson')) {
      const aimAction = {
        type: 'firstperson',
      };
      localPlayer.addAction(aimAction);
    }
  } else {
    localPlayer.removeAction('firstperson');
  }
};
if (cameraManager.getMode() === 'firstperson') {
  _setFirstPersonAction(true);
}
cameraManager.addEventListener('modechange', e => {
  const {mode} = e.data;
  const firstPerson = mode === 'firstperson';
  _setFirstPersonAction(firstPerson);
});

let lastMouseEvent = null;
class GameManager extends EventTarget {
  constructor() {
    super();

    this.menuOpen = 0;
    this.gridSnap = 0;
    this.editMode = false;
    this.dragging = false;
    this.draggingRight = false;
    this.contextMenu = false;
    this.contextMenuObject = null;
    this.inventoryHack = false;
    this.closestObject = null;
    this.usableObject = null;
    this.hoverEnabled = false;
  }
  getMenu() {
    return this.menuOpen;
  }
  setMenu(newOpen) {
    this.menuOpen = newOpen;
    if (newOpen) {
      _selectItem(0);
    }
  }
  menuVertical(offset) {
    if (this.menuOpen) {
      _selectItemDelta(offset);
    }
  }
  menuHorizontal(offset) {
    if (this.menuOpen) {
      _selectTabDelta(offset);
    }
  }
  setContextMenu(contextMenu) {
    this.contextMenu = contextMenu;
  }
  getContextMenuObject() {
    return this.contextMenuObject;
  }
  setContextMenuObject(contextMenuObject) {
    this.contextMenuObject = contextMenuObject;
  }
  menuUse() {
    _use();
  }
  menuDelete() {
    _delete();
  }
  menuClick() {
    _click();
  }
  menuMouseDown() {
    _mousedown();
  }
  menuMouseUp() {
    _mouseup();
  }
  menuAim() {
    const localPlayer = metaversefileApi.useLocalPlayer();
    if (!localPlayer.hasAction('aim')) {
      const localPlayer = metaversefileApi.useLocalPlayer();
      const wearApp = loadoutManager.getSelectedApp();
      const wearAimApp = (() => {
        if (wearApp) {
          const aimComponent = wearApp.getComponent('aim');
          if (aimComponent) {
            return wearApp;
          }
        }
        return null;
      })();
      const wearAimComponent = wearAimApp?.getComponent('aim');

      const {instanceId} = wearAimApp ?? {};
      const {appAnimation, playerAnimation, boneAttachment, position, quaternion, scale} = wearAimComponent ?? {};
      const aimAction = {
        type: 'aim',
        instanceId,
        appAnimation,
        playerAnimation,
        boneAttachment,
        position,
        quaternion,
        scale,
      };
      localPlayer.addAction(aimAction);
    }
  }
  menuUnaim() {
    const localPlayer = metaversefileApi.useLocalPlayer();
    const aimAction = localPlayer.getAction('aim');
    if (aimAction) {
      localPlayer.removeAction('aim');
    }
  }
  menuDragdown(e) {
    this.dragging = true;
    
    world.appManager.dispatchEvent(new MessageEvent('dragchange', {
      data: {
        dragging: this.dragging,
      },
    }));
  }
  menuDrag(e) {
    const {movementX, movementY} = e;
    if (Math.abs(movementX) < 100 && Math.abs(movementY) < 100) { // hack around a Chrome bug
      camera.position.add(localVector.copy(cameraManager.getCameraOffset()).applyQuaternion(camera.quaternion));
  
      camera.rotation.y -= movementX * Math.PI * 2 * 0.0005;
      camera.rotation.x -= movementY * Math.PI * 2 * 0.0005;
      camera.rotation.x = Math.min(Math.max(camera.rotation.x, -Math.PI / 2), Math.PI / 2);
      camera.quaternion.setFromEuler(camera.rotation);

      camera.position.sub(localVector.copy(cameraManager.getCameraOffset()).applyQuaternion(camera.quaternion));

      camera.updateMatrixWorld();
    }
  }
  menuDragup() {
    this.dragging = false;
    
    world.appManager.dispatchEvent(new MessageEvent('dragchange', {
      data: {
        dragging: this.dragging,
      },
    }));
  }
  menuDragdownRight(e) {
    this.draggingRight = true;
  }
  menuDragRight(e) {
    // this.draggingRight = true;
  }
  menuDragupRight() {
    this.draggingRight = false;
  }
  menuKey(c) {
    menuMesh.key(c);
  }
  menuSelectAll() {
    menuMesh.selectAll();
  }
  menuPaste(s) {
    menuMesh.paste(s);
  }
  inputFocused() {
    return !!document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.nodeName);
  }
  canGrab() {
    return !!highlightedObject /*&& !editedObject*/;
  }
  canRotate() {
    return !!_getGrabbedObject(0);
    // return !!world.appManager.grabbedObjects[0];
  }
  menuRotate(direction) {
    const object = _getGrabbedObject(0);
    object.savedRotation.y -= direction * rotationSnap;
  }
  dropSelectedApp() {
    const localPlayer = metaversefileApi.useLocalPlayer();
    const app = loadoutManager.getSelectedApp();
    if (app) {
      localPlayer.unwear(app);
    }
  }
  deleteSelectedApp() {
    if (this.selectedIndex !== -1) {
      const localPlayer = metaversefileApi.useLocalPlayer();
      const app = loadoutManager.getSelectedApp();
      if (app) {
        localPlayer.unwear(app, {
          destroy: true,
        });
      }
    }
  }
  canPush() {
    return !!_getGrabbedObject(0);
    // return !!world.appManager.grabbedObjects[0] /*|| (editedObject && editedObject.isBuild)*/;
  }
  menuPush(direction) {
    const localPlayer = metaversefileApi.useLocalPlayer();
    const grabAction = localPlayer.findAction(action => action.type === 'grab' && action.hand === 'left');
    if (grabAction) {
      const matrix = localMatrix.fromArray(grabAction.matrix);
      matrix
        .decompose(localVector, localQuaternion, localVector2);
      localVector.z += direction * 0.1;
      matrix
        .compose(localVector, localQuaternion, localVector2)
        .toArray(grabAction.matrix);
    } else {
      console.warn('trying to push with no grab object');
    }
  }
  menuGridSnap() {
    if (this.gridSnap === 0) {
      this.gridSnap = 32;
    } else if (this.gridSnap > 1) {
      this.gridSnap /= 2;
    } else {
      this.gridSnap = 0;
    }
    // gridSnapEl.innerText = this.gridSnap > 0 ? (this.gridSnap + '') : 'off';
  }
  getGridSnap() {
    if (this.gridSnap === 0) {
      return 0;
    } else {
      return 4/this.gridSnap;
    }
  }

  menuVDown() {
    if (_getGrabbedObject(0)) {
      this.menuGridSnap();
    } else {
      const localPlayer = metaversefileApi.useLocalPlayer();
      localPlayer.removeAction('dance');

      const newAction = {
        type: 'dance',
        animation: 'dansu',
        // time: 0,
      };
      localPlayer.addAction(newAction);
    }
  }
  menuVUp(e) {
    const localPlayer = metaversefileApi.useLocalPlayer();
    localPlayer.removeAction('dance');
  }
  menuBDown(e) {
    const localPlayer = metaversefileApi.useLocalPlayer();
    
    const sssAction = localPlayer.getAction('sss');
    if (!sssAction) {
      const newSssAction = {
        type: 'sss',
      };
      localPlayer.addAction(newSssAction);

      localPlayer.removeAction('dance');
      const newDanceAction = {
        type: 'dance',
        animation: 'powerup',
        // time: 0,
      };
      localPlayer.addAction(newDanceAction);
    } else {
      localPlayer.removeAction('sss');
      localPlayer.removeAction('dance');
    }

    /* if (e.ctrlKey) {
      universe.reload();
    } */
  }
  menuBUp() {
    const localPlayer = metaversefileApi.useLocalPlayer();
    localPlayer.removeAction('dance');
    
    // physicsManager.setThrowState(null);
  }
  menuDoubleTap() {
    if (!this.isCrouched()) {
      const localPlayer = metaversefileApi.useLocalPlayer();
      const narutoRunAction = localPlayer.getAction('narutoRun');
      if (!narutoRunAction) {
        const newNarutoRunAction = {
          type: 'narutoRun',
          // time: 0,
        };
        localPlayer.addAction(newNarutoRunAction);
      }
    }
  }
  menuUnDoubleTap() {
    const localPlayer = metaversefileApi.useLocalPlayer();
    const narutoRunAction = localPlayer.getAction('narutoRun');
    if (narutoRunAction) {
      localPlayer.removeAction('narutoRun');
    }
  }
  isFlying() {
    return metaversefileApi.useLocalPlayer().hasAction('fly');
  }
  toggleFly() {
    const localPlayer = metaversefileApi.useLocalPlayer();
    const flyAction = localPlayer.getAction('fly');
    if (flyAction) {
      localPlayer.removeAction('fly');
    } else {
      const flyAction = {
        type: 'fly',
        time: 0,
      };
      localPlayer.setControlAction(flyAction);
    }
  }
  isCrouched() {
    return metaversefileApi.useLocalPlayer().hasAction('crouch');
  }
  toggleCrouch() {
    const localPlayer = metaversefileApi.useLocalPlayer();
    let crouchAction = localPlayer.getAction('crouch');
    if (crouchAction) {
      localPlayer.removeAction('crouch');
    } else {
      const crouchAction = {
        type: 'crouch',
      };
      localPlayer.addAction(crouchAction);
    }
  }
  async handleDropJsonItemToPlayer(item, index) {
    const u = await handleDropJsonItem(item);
    return await this.handleDropUrlToPlayer(u, index);
  }
  async handleDropJsonToPlayer(j, index) {
    const u = getDropUrl(j);
    return await this.handleDropUrlToPlayer(u, index);
  }
  async handleDropUrlToPlayer(u, index) {
    const app = await metaversefileApi.createAppAsync({
      start_url: u,
    });
    world.appManager.importApp(app);
    app.activate();
    // XXX set to index
  }
  selectLoadout(index) {
    loadoutManager.setSelectedIndex(index);
  }
  canToggleAxis() {
    return false; // !!world.appManager.grabbedObjects[0]; // || (editedObject && editedObject.isBuild);
  }
  toggleAxis() {
    console.log('toggle axis');
  }
  async toggleEditMode() {
    this.editMode = !this.editMode;
    // console.log('got edit mode', this.editMode);
    if (this.editMode) {
      if (!cameraManager.pointerLockElement) {
        await cameraManager.requestPointerLock();
      }
      if (this.mouseSelectedObject) {
        this.setMouseSelectedObject(null);
      }
      if (_getGrabbedObject(0)) {
        const localPlayer = metaversefileApi.useLocalPlayer();
        localPlayer.ungrab();
      } 
    }
  }
  isJumping() {
    return metaversefileApi.useLocalPlayer().hasAction('jump');
  }
  ensureJump() {
    const localPlayer = metaversefileApi.useLocalPlayer();
    const jumpAction = localPlayer.getAction('jump');

    const wearActions = Array.from(localPlayer.getActionsState()).filter(action => action.type === 'wear');
    for (const wearAction of wearActions) {
      const instanceId = wearAction.instanceId;
      const app = metaversefileApi.getAppByInstanceId(instanceId);
      const sitComponent = app.getComponent('sit');
      if (sitComponent) {
        app.unwear();
      }
    }

    if (!jumpAction) {
      const newJumpAction = {
        type: 'jump',
        // time: 0,
      };
      localPlayer.addAction(newJumpAction);
    }
  }
  jump() {
    // add jump action
    this.ensureJump();

    // update velocity
    const localPlayer = metaversefileApi.useLocalPlayer();
    localPlayer.characterPhysics.velocity.y += 6;
    
    // play sound
    // soundManager.play('jump');

  }
  isMovingBackward() {
    // return ioManager.keysDirection.z > 0 && this.isAiming();
    const localPlayer = metaversefileApi.useLocalPlayer();
    return localPlayer.avatar.direction.z > 0.1; // If check > 0 will cause glitch when move left/right;
  }
  isAiming() {
    return metaversefileApi.useLocalPlayer().hasAction('aim');
  }
  isSitting() {
    return metaversefileApi.useLocalPlayer().hasAction('sit');
  }
  getMouseHoverObject() {
    return mouseHoverObject;
  }
  getMouseHoverPhysicsId() {
    return mouseHoverPhysicsId;
  }
  getMouseHoverPosition() {
    return mouseHoverPosition;
  }
  setHoverEnabled(hoverEnabled) {
    this.hoverEnabled = hoverEnabled;
  }
  setMouseHoverObject(o, physicsId, position) {
    mouseHoverObject = o;
    mouseHoverPhysicsId = physicsId;
    if (mouseHoverObject && position) {
      mouseHoverPosition = position.clone();
    } else {
      mouseHoverPosition = null;
    }
    
    // console.log('set mouse hover', !!mouseHoverObject);
    world.appManager.dispatchEvent(new MessageEvent('hoverchange', {
      data: {
        app: mouseHoverObject,
        physicsId: mouseHoverPhysicsId,
        position: mouseHoverPosition,
      },
    }));
  }
  getMouseSelectedObject() {
    return mouseSelectedObject;
  }
  getMouseSelectedPhysicsId() {
    return mouseSelectedPhysicsId;
  }
  getMouseSelectedPosition() {
    return mouseSelectedPosition;
  }
  setMouseSelectedObject(o, physicsId, position) {
    mouseSelectedObject = o;
    mouseSelectedPhysicsId = physicsId;
    if (mouseSelectedObject && position) {
      mouseSelectedPosition = position.clone();
    } else {
      mouseSelectedPosition = null;
    }
    
    world.appManager.dispatchEvent(new MessageEvent('selectchange', {
      data: {
        app: mouseSelectedObject,
        physicsId: mouseSelectedPhysicsId,
        position: mouseSelectedPosition,
      },
    }));
  }
  getMouseDomHoverObject() {
    return mouseDomHoverObject;
  }
  setMouseDomHoverObject(o, physicsId) {
    mouseDomHoverObject = o;
    mouseDomHoverPhysicsId = physicsId;
  }
  getMouseDomEquipmentHoverObject(o, physicsId) {
    return mouseDomEquipmentHoverObject;
  }
  setMouseDomEquipmentHoverObject(o, physicsId) {
    mouseDomEquipmentHoverObject = o;
    mouseDomEquipmentHoverPhysicsId = physicsId;
  }
  getSpeed() {
    let speed = 0;
    
    const walkSpeed = 0.075;
    const flySpeed = walkSpeed * 2;
    const defaultCrouchSpeed = walkSpeed * 0.7;
    const isCrouched = gameManager.isCrouched();
    const isMovingBackward = gameManager.isMovingBackward();
    if (isCrouched && !isMovingBackward) {
      speed = defaultCrouchSpeed;
    } else if (gameManager.isFlying()) {
      speed = flySpeed;
    } else {
      speed = walkSpeed;
    }
    
    const sprintMultiplier = (ioManager.keys.shift && !isCrouched) ?
      (ioManager.keys.doubleTap ? 20 : 3)
    :
      1;
    speed *= sprintMultiplier;
    
    const backwardMultiplier = isMovingBackward ? 0.7 : 1;
    speed *= backwardMultiplier;
    
    return speed;
  }
  getClosestObject() {
    return gameManager.closestObject;
  }
  getUsableObject() {
    return gameManager.usableObject;
  }
  getLastMouseEvent() {
    return lastMouseEvent;
  }
  setLastMouseEvent(e) {
    if (!lastMouseEvent) {
      lastMouseEvent = {
        clientX: 0,
        clientY: 0,
        inside: false,
      };
    }
    if (e) {
      lastMouseEvent.clientX = e.clientX;
      lastMouseEvent.clientY = e.clientY;
      lastMouseEvent.inside = true;
    } else {
      lastMouseEvent.inside = false;
    }
  }
  getDragRightSpec() {
    return dragRightSpec;
  }
  menuActivateDown() {
    if (grabUseMesh.visible) {
      const localPlayer = metaversefileApi.useLocalPlayer();
      const activateAction = localPlayer.getAction('activate');
      if (!activateAction) {
        const newActivateAction = {
          type: 'activate',
          // time: 0,
        };
        localPlayer.addAction(newActivateAction);
      }
    }
  }
  menuActivateUp() {
    const localPlayer = metaversefileApi.useLocalPlayer();
    localPlayer.removeAction('activate');
  }
  setAvatarQuality(quality) {
    const localPlayer = metaversefileApi.useLocalPlayer();
    localPlayer.avatar.setQuality(quality);
  }
  playerDiorama = null;
  bindDioramaCanvas() {
    // await rendererWaitForLoad();

    const localPlayer = metaversefileApi.useLocalPlayer();
    this.playerDiorama = dioramaManager.createPlayerDiorama({
      target: localPlayer,
      // label: true,
      outline: true,
      grassBackground: true,
      // glyphBackground: true,
    });
    localPlayer.addEventListener('avatarchange', e => {
      this.playerDiorama.setObjects([
        e.avatar.model,
      ]);
    });
  }
  loadVoicePack(voicePack) {
    const localPlayer = metaversefileApi.useLocalPlayer();
    return localPlayer.loadVoicePack(voicePack);
  }
  setVoiceEndpoint(voiceId) {
    const localPlayer = metaversefileApi.useLocalPlayer();
    return localPlayer.setVoiceEndpoint(voiceId);
  }
  saveScene() {
    const scene = world.appManager.exportJSON();
    const s = JSON.stringify(scene, null, 2);
    const blob = new Blob([s], {
      type: 'application/json',
    });
    downloadFile(blob, 'scene.json');
    // console.log('got scene', scene);
  }
  update = _gameUpdate;
  pushAppUpdates = _pushAppUpdates;
  pushPlayerUpdates = _pushPlayerUpdates;
}
const gameManager = new GameManager();
export default gameManager;