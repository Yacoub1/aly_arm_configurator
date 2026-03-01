from jinja2 import Environment, FileSystemLoader
from pathlib import Path


def generate_xacro(robot_config):
    templates_dir = Path(__file__).parent.parent / "templates"
    env = Environment(loader=FileSystemLoader(templates_dir))
    template = env.get_template("robot.xacro.j2")

    output = template.render(robot=robot_config)

    output_dir = Path("generated")
    output_dir.mkdir(exist_ok=True)

    output_path = output_dir / f"{robot_config.robot_name}.xacro"
    output_path.write_text(output)

    return output_path
