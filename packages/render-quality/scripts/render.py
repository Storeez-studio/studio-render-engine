#!/usr/bin/env python3
"""
Gravitaslabs Studio Engine -- Blender Headless Render Script
Usage: blender --background --python render.py -- --config config.json --output /output/
"""
import bpy
import sys
import json
import argparse
import os


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(argv)


def load_config(path):
    with open(path) as f:
        return json.load(f)


def setup_render(config):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = 256
    scene.render.resolution_x = 3840
    scene.render.resolution_y = 2160
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 95


def apply_livery(config):
    """Apply livery texture from config to car mesh"""
    livery = config.get("creative", {}).get("liveryPattern")
    if not livery:
        return
    car_obj = None
    for obj in bpy.data.objects:
        if obj.type == "MESH" and "car" in obj.name.lower():
            car_obj = obj
            break
    if not car_obj:
        print("Warning: No car mesh found")
        return
    mat = bpy.data.materials.get("Livery") or bpy.data.materials.new("Livery")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    hex_color = livery["colorPrimary"].lstrip("#")
    r = int(hex_color[0:2], 16) / 255
    g = int(hex_color[2:4], 16) / 255
    b = int(hex_color[4:6], 16) / 255
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1)
    output = nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    if car_obj.data.materials:
        car_obj.data.materials[0] = mat
    else:
        car_obj.data.materials.append(mat)


def render_angles(config, output_dir):
    """Render all requested camera angles"""
    angles = config.get("render", {}).get("cameraAngles", ["hero"])
    camera_positions = {
        "hero": (0, -8, 2),
        "front-34": (-4, -6, 2),
        "rear-34": (4, 6, 2),
        "detail": (-2, -3, 1),
        "overhead": (0, 0, 10),
    }
    results = []
    for angle in angles:
        pos = camera_positions.get(angle, (0, -8, 2))
        cam = bpy.data.objects.get("Camera") or bpy.data.objects.new(
            "Camera", bpy.data.cameras.new("Camera")
        )
        if cam.name not in bpy.context.scene.objects:
            bpy.context.scene.collection.objects.link(cam)
        cam.location = pos
        cam.rotation_euler = (1.1, 0, 0.7)
        bpy.context.scene.camera = cam
        output_path = os.path.join(output_dir, angle + ".jpg")
        bpy.context.scene.render.filepath = output_path
        bpy.ops.render.render(write_still=True)
        results.append({"angle": angle, "path": output_path})
        print("Rendered: " + angle + " -> " + output_path)
    return results


def main():
    args = parse_args()
    config = load_config(args.config)
    os.makedirs(args.output, exist_ok=True)
    setup_render(config)
    apply_livery(config)
    results = render_angles(config, args.output)
    results_path = os.path.join(args.output, "results.json")
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)
    print("Done. " + str(len(results)) + " renders -> " + args.output)


if __name__ == "__main__":
    main()
