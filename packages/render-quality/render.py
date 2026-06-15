#!/usr/bin/env python3
# render.py -- Blender 4.3 Headless Render Script
import bpy, sys, json, argparse, os, math, traceback

def parse_args():
    argv=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    p=argparse.ArgumentParser()
    p.add_argument("--config",required=True)
    return p.parse_args(argv)

def load_config(path):
    with open(path,encoding="utf-8") as f: return json.load(f)

def setup_cycles(config):
    scene=bpy.context.scene
    scene.render.engine="CYCLES"
    cfg=config.get("_blender",{})
    samples=cfg.get("samples",512 if config.get("quality")=="final" else 128)
    scene.cycles.samples=samples
    scene.cycles.use_denoising=True
    scene.cycles.denoiser="OPENIMAGEDENOISE"
    if cfg.get("useGpu",True):
        prefs=bpy.context.preferences.addons["cycles"].preferences
        activated=False
        for dtype in ("OPTIX","CUDA","HIP","METAL"):
            try:
                prefs.compute_device_type=dtype
                prefs.get_devices()
                gpus=[d for d in prefs.devices if d.type!="CPU"]
                if not gpus: continue
                for d in prefs.devices: d.use=(d.type!="CPU")
                scene.cycles.device="GPU"
                activated=True
                print("[render.py] GPU: {} ({} device(s))".format(dtype,len(gpus)))
                break
            except Exception as e:
                print("[render.py] {} not available: {}".format(dtype,e))
        if not activated:
            print("[render.py] No GPU -- falling back to CPU")
            scene.cycles.device="CPU"
    else:
        scene.cycles.device="CPU"
    print("[render.py] samples={}  device={}".format(samples,scene.cycles.device))

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for c in (bpy.data.meshes,bpy.data.materials,bpy.data.lights,bpy.data.cameras):
        for b in list(c): c.remove(b)

def _dir_to_euler(dx,dy,dz):
    import mathutils
    v=mathutils.Vector((dx,dy,dz))
    if v.length==0: return (0.0,0.0,0.0)
    v.normalize()
    e=v.to_track_quat("-Z","Y").to_euler()
    return (e.x,e.y,e.z)

def _area(name,loc,energy,color=(1,1,1),size=3.0):
    ld=bpy.data.lights.new(name,"AREA")
    ld.energy,ld.color,ld.size=energy,color,size
    o=bpy.data.objects.new(name,ld)
    bpy.context.scene.collection.objects.link(o)
    o.location=loc
    o.rotation_euler=_dir_to_euler(-loc[0],-loc[1],-loc[2])
    return o

def _sun(name,direction,energy,color=(1,1,1)):
    ld=bpy.data.lights.new(name,"SUN")
    ld.energy,ld.color,ld.angle=energy,color,math.radians(0.5)
    o=bpy.data.objects.new(name,ld)
    bpy.context.scene.collection.objects.link(o)
    o.location=(0,0,10)
    o.rotation_euler=_dir_to_euler(*direction)
    return o

def _spot(name,loc,energy,color=(1,1,1)):
    ld=bpy.data.lights.new(name,"SPOT")
    ld.energy,ld.color=energy,color
    ld.spot_size,ld.spot_blend=math.radians(60),0.3
    o=bpy.data.objects.new(name,ld)
    bpy.context.scene.collection.objects.link(o)
    o.location=loc
    o.rotation_euler=_dir_to_euler(-loc[0],-loc[1],-loc[2])
    return o

GROUND_PROPS={
    "studio-white":     {"Base Color":(0.95,0.95,0.95,1),"Roughness":0.8},
    "studio-dark":      {"Base Color":(0.05,0.05,0.05,1),"Roughness":0.2,"Metallic":0.8},
    "race-track-day":   {"Base Color":(0.08,0.08,0.08,1),"Roughness":0.95},
    "race-track-night": {"Base Color":(0.08,0.08,0.08,1),"Roughness":0.95},
    "city-night":       {"Base Color":(0.04,0.04,0.06,1),"Roughness":0.15},
    "golden-hour":      {"Base Color":(0.55,0.42,0.28,1),"Roughness":0.9},
}

def _add_ground_plane(preset_key):
    bpy.ops.mesh.primitive_plane_add(size=40,location=(0,0,-0.01))
    plane=bpy.context.active_object
    plane.name="GroundPlane"
    mat=bpy.data.materials.new("Ground")
    mat.use_nodes=True
    n,lk=mat.node_tree.nodes,mat.node_tree.links
    n.clear()
    bsdf=n.new("ShaderNodeBsdfPrincipled")
    out=n.new("ShaderNodeOutputMaterial")
    lk.new(bsdf.outputs["BSDF"],out.inputs["Surface"])
    props=GROUND_PROPS.get(preset_key,{"Base Color":(0.5,0.5,0.5,1),"Roughness":0.8})
    for k,v in props.items(): bsdf.inputs[k].default_value=v
    plane.data.materials.append(mat)

def setup_scene_preset(preset_key):
    world=bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world=world
    world.use_nodes=True
    nodes,links=world.node_tree.nodes,world.node_tree.links
    nodes.clear()
    bg=nodes.new("ShaderNodeBackground")
    out=nodes.new("ShaderNodeOutputWorld")
    links.new(bg.outputs["Background"],out.inputs["Surface"])

    if preset_key=="studio-white":
        bg.inputs["Color"].default_value=(0.95,0.95,0.95,1.0)
        bg.inputs["Strength"].default_value=1.5
        _area("Key",(3,-5,6),800,(1.0,0.98,0.95))
        _area("Fill",(-4,-3,4),300,(0.95,0.97,1.0))
        _area("Rim",(0,5,4),150,(1.0,1.0,1.0))
    elif preset_key=="studio-dark":
        bg.inputs["Color"].default_value=(0.02,0.02,0.02,1.0)
        bg.inputs["Strength"].default_value=0.1
        _area("Key",(4,-4,5),1200,(0.9,0.92,1.0))
        _area("Rim_L",(-5,2,3),600,(0.6,0.8,1.0))
        _area("Rim_R",(5,2,3),400,(1.0,0.7,0.5))
    elif preset_key in ("race-track-day","golden-hour"):
        sky=nodes.new("ShaderNodeTexSky")
        sky.sky_type="NISHITA"
        if preset_key=="race-track-day":
            sky.sun_elevation,sky.sun_rotation=math.radians(45),math.radians(30)
            bg.inputs["Strength"].default_value=2.0
            links.new(sky.outputs["Color"],bg.inputs["Color"])
            _sun("Sun",(-0.5,-0.5,-1.0),5.0,(1.0,0.95,0.85))
            _area("Fill",(-3,3,2),100,(0.85,0.92,1.0))
        else:
            sky.sun_elevation,sky.sun_rotation=math.radians(8),math.radians(270)
            bg.inputs["Strength"].default_value=2.5
            links.new(sky.outputs["Color"],bg.inputs["Color"])
            _sun("Sun",(-1.0,0.0,-0.14),3.0,(1.0,0.6,0.2))
            _area("Sky_Fill",(0,0,10),150,(0.6,0.75,1.0))
    elif preset_key=="race-track-night":
        bg.inputs["Color"].default_value=(0.01,0.01,0.03,1.0)
        bg.inputs["Strength"].default_value=0.05
        _spot("Flood_L",(-10,0,15),8000,(1.0,0.98,0.9))
        _spot("Flood_R",(10,0,15),8000,(1.0,0.98,0.9))
        _spot("Flood_F",(0,-12,12),5000,(0.9,0.95,1.0))
        _area("Rim",(0,6,3),200,(0.5,0.7,1.0))
    elif preset_key=="city-night":
        bg.inputs["Color"].default_value=(0.03,0.02,0.05,1.0)
        bg.inputs["Strength"].default_value=0.3
        _area("Neon_R",(6,0,3),400,(1.0,0.1,0.5))
        _area("Neon_L",(-6,0,3),300,(0.1,0.5,1.0))
        _area("Street",(0,-6,6),200,(1.0,0.85,0.5))
        _area("Ambient",(0,0,8),80,(0.4,0.3,0.6))
    else:
        print("[render.py] Unknown preset '{}'  -- studio-white fallback".format(preset_key))
        bg.inputs["Color"].default_value=(0.95,0.95,0.95,1.0)
        bg.inputs["Strength"].default_value=1.5
        _area("Key",(3,-5,6),800,(1.0,0.98,0.95))
        _area("Fill",(-4,-3,4),300,(0.95,0.97,1.0))
        _area("Rim",(0,5,4),150,(1.0,1.0,1.0))

    _add_ground_plane(preset_key)

def import_glb(glb_path):
    print("[render.py] Importing GLB: {}".format(glb_path))
    if not os.path.exists(glb_path):
        raise FileNotFoundError("GLB not found: {}".format(glb_path))
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb_path)
    imported=list(set(bpy.data.objects)-before)
    print("[render.py] Imported {} object(s)".format(len(imported)))
    if not imported: raise RuntimeError("GLB import produced no objects")
    mesh_objs=[o for o in imported if o.type=="MESH"]
    if mesh_objs: _centre_objects(mesh_objs)
    return imported

def _centre_objects(objects):
    import mathutils
    INF=float("inf")
    mn,mx=mathutils.Vector((INF,)*3),mathutils.Vector((-INF,)*3)
    for obj in objects:
        for c in obj.bound_box:
            wc=obj.matrix_world @ mathutils.Vector(c)
            for i in range(3):
                mn[i]=min(mn[i],wc[i])
                mx[i]=max(mx[i],wc[i])
    offset=mathutils.Vector((-(mn.x+mx.x)/2,-(mn.y+mx.y)/2,-mn.z))
    for obj in objects:
        if obj.parent is None: obj.location+=offset

def apply_livery_texture(config,imported_objects):
    livery_path=config.get("liveryTexturePath")
    if not livery_path:
        print("[render.py] No livery texture -- model materials unchanged")
        return
    if not os.path.exists(livery_path):
        print("[render.py] Warning: livery not found at {} -- skipped".format(livery_path))
        return
    print("[render.py] Applying livery: {}".format(livery_path))
    img=bpy.data.images.load(livery_path,check_existing=True)
    mesh_objs=[o for o in imported_objects if o.type=="MESH"]
    if not mesh_objs:
        print("[render.py] No mesh objects for livery")
        return
    for obj in mesh_objs:
        mat=bpy.data.materials.new("LiveryMat_{}".format(obj.name))
        mat.use_nodes=True
        n,lk=mat.node_tree.nodes,mat.node_tree.links
        n.clear()
        uv=n.new("ShaderNodeTexCoord")
        tex=n.new("ShaderNodeTexImage")
        tex.image=img
        bsdf=n.new("ShaderNodeBsdfPrincipled")
        out=n.new("ShaderNodeOutputMaterial")
        bsdf.inputs["Roughness"].default_value=0.3
        bsdf.inputs["Metallic"].default_value=0.1
        lk.new(uv.outputs["UV"],tex.inputs["Vector"])
        lk.new(tex.outputs["Color"],bsdf.inputs["Base Color"])
        lk.new(bsdf.outputs["BSDF"],out.inputs["Surface"])
        if obj.data.materials: obj.data.materials[0]=mat
        else: obj.data.materials.append(mat)
    print("[render.py] Livery applied to {} mesh(es)".format(len(mesh_objs)))

CAMERA_SETUPS={
    "front-34":{"location":(-4.5,-5.5,2.0),"target":(0.0,0.0,0.8)},
    "rear-34": {"location":(4.5,5.5,2.0),  "target":(0.0,0.0,0.8)},
    "hero":    {"location":(0.0,-7.0,2.2),  "target":(0.0,0.0,0.8)},
    "detail":  {"location":(-2.0,-3.0,1.2), "target":(0.0,0.0,0.5)},
}

def create_camera(angle_key):
    import mathutils
    setup=CAMERA_SETUPS.get(angle_key,CAMERA_SETUPS["hero"])
    cam_data=bpy.data.cameras.new("Cam_{}".format(angle_key))
    cam_data.lens,cam_data.clip_start,cam_data.clip_end=50,0.1,1000
    cam_obj=bpy.data.objects.new("Cam_{}".format(angle_key),cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    cam_obj.location=setup["location"]
    direction=mathutils.Vector(setup["target"])-mathutils.Vector(cam_obj.location)
    cam_obj.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()
    bpy.context.scene.camera=cam_obj
    return cam_obj

def render_all_angles(config,output_dir):
    job_id=config.get("jobId","render")
    angles=config.get("cameraAngles",["hero"])
    cfg=config.get("_blender",{})
    r4k=cfg.get("resolution4k",{"x":3840,"y":2160})
    r1080=cfg.get("resolution1080p",{"x":1920,"y":1080})
    results=[]
    scene=bpy.context.scene
    for angle in angles:
        print("[render.py] === Angle: {} ===".format(angle))
        cam=create_camera(angle)
        scene.render.resolution_x=r4k["x"]
        scene.render.resolution_y=r4k["y"]
        scene.render.resolution_percentage=100
        scene.render.image_settings.file_format="PNG"
        scene.render.image_settings.compression=15
        out_4k=os.path.join(output_dir,"{}_{}_4k.png".format(job_id,angle))
        scene.render.filepath=out_4k
        bpy.ops.render.render(write_still=True)
        print("[render.py] 4K -> {}".format(out_4k))
        results.append({"angle":angle,"resolution":"4k","format":"png","path":out_4k})
        scene.render.resolution_x=r1080["x"]
        scene.render.resolution_y=r1080["y"]
        scene.render.image_settings.file_format="JPEG"
        scene.render.image_settings.quality=92
        out_1080=os.path.join(output_dir,"{}_{}_1080p.jpg".format(job_id,angle))
        scene.render.filepath=out_1080
        bpy.ops.render.render(write_still=True)
        print("[render.py] 1080p -> {}".format(out_1080))
        results.append({"angle":angle,"resolution":"1080p","format":"jpeg","path":out_1080})
        bpy.data.objects.remove(cam,do_unlink=True)
    return results

def main():
    args=parse_args()
    print("[render.py] Config: {}".format(args.config))
    try:
        config=load_config(args.config)
    except Exception as exc:
        print("[render.py] FATAL: {}".format(exc))
        sys.exit(1)
    job_id=config.get("jobId","unknown")
    out_dir=config.get("outputDir",".")
    preset=config.get("scenePreset","studio-white")
    glb=config.get("glbPath","")
    print("[render.py] Job={}  Scene={}  GLB={}  Out={}".format(job_id,preset,glb,out_dir))
    os.makedirs(out_dir,exist_ok=True)
    try:
        setup_cycles(config)
        clear_scene()
        setup_scene_preset(preset)
        objs=import_glb(glb)
        apply_livery_texture(config,objs)
        results=render_all_angles(config,out_dir)
        with open(os.path.join(out_dir,"results.json"),"w",encoding="utf-8") as fp:
            json.dump(results,fp,indent=2)
        print("[render.py] Done. {} renders -> {}".format(len(results),out_dir))
    except Exception as exc:
        print("[render.py] FATAL ERROR in job {}:".format(job_id))
        traceback.print_exc()
        try:
            with open(os.path.join(out_dir,"results.json"),"w") as fp:
                json.dump({"error":str(exc),"jobId":job_id},fp)
        except Exception: pass
        sys.exit(1)

if __name__=="__main__":
    main()