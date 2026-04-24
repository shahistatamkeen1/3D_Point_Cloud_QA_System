import open3d as o3d
import numpy as np

points = []

# floor
for x in np.linspace(0, 10, 50):
    for y in np.linspace(0, 10, 50):
        points.append([x, y, 0])

# ceiling
for x in np.linspace(0, 10, 50):
    for y in np.linspace(0, 10, 50):
        points.append([x, y, 3])

# walls
for z in np.linspace(0, 3, 50):
    for x in np.linspace(0, 10, 50):
        points.append([x, 0, z])
        points.append([x, 10, z])

    for y in np.linspace(0, 10, 50):
        points.append([0, y, z])
        points.append([10, y, z])

print("Total points:", len(points))

pcd = o3d.geometry.PointCloud()
pcd.points = o3d.utility.Vector3dVector(points)

o3d.io.write_point_cloud("room.ply", pcd)