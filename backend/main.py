from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import tempfile
import subprocess
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MESH_DIR = os.path.join(BASE_DIR, "meshes")

app = FastAPI()

# CORS (important)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve meshes folder
app.mount("/meshes", StaticFiles(directory=MESH_DIR), name="meshes")

print("Mesh dir:", MESH_DIR)
print("Exists:", os.path.exists(MESH_DIR))


@app.post("/preview")
async def preview_robot(request: Request):
    xml = (await request.body()).decode()

    try:
        # Save temp xacro
        with tempfile.NamedTemporaryFile(delete=False, suffix=".xacro") as xf:
            xf.write(xml.encode())
            xacro_path = xf.name

        urdf_path = xacro_path.replace(".xacro", ".urdf")

        # Convert xacro → urdf
        subprocess.run(["xacro", xacro_path, "-o", urdf_path], check=True)

        # Read URDF back
        with open(urdf_path, "r") as f:
            urdf_string = f.read()

        # IMPORTANT: replace package:// with web path
        urdf_string = urdf_string.replace(
            "package://aly_arm_0_description/meshes/", "http://localhost:8000/meshes/"
        )

        return JSONResponse({"urdf": urdf_string})

    except Exception as e:
        return JSONResponse({"error": str(e)})
