# aly_arm_description

Robot description package for **Aly Arm** – a custom N-DOF robotic manipulator.

This package contains the URDF/XACRO model, meshes, and launch files required to visualize and use the robot in ROS 2 (Jazzy), including integration with MoveIt2 and ros2_control.

---



link_previous(active)
   └── fixed joint
         └── passive_link_i
              └── fixed joint
                    └── motor_holder( revolute/prismatic joint)
                          └──joint (revolute/prismatic joint)
                              └── active_link_i+1
                                    └── fixed joint
                                          └── passive_link_i+1
                                              └── ...


world
   └── fixed joint
            └── base
               └── fixed joint
                        └── holder (77,56, etc, future developments)
                                    └── fixed joint
                                          └── motor_holder( revolute OR prismatic joint)
                                                            └──joint (revolute OR prismatic joint)
                                                                  └── active_link_i+1 (active link, rack in presmatic, future developments)
                                                                        └── fixed joint
                                                                              └── passive_link_i+1
                                                                                    └── ...