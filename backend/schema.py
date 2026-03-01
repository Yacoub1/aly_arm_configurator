from pydantic import BaseModel
from typing import List, Literal


class StageConfig(BaseModel):
    joint_type: Literal["revolute", "prismatic"]
    passive_mesh: str
    motor_holder_mesh: str
    active_mesh: str


class RobotConfig(BaseModel):
    robot_name: str
    base_type: Literal["77mm", "56mm"]
    base_mesh: str
    stages: List[StageConfig]
