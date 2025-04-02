import mongoose, { Schema, Document } from 'mongoose';

export interface IResourceNode extends Document {
  nodeType: string;
  specificType: string;
  x: number;
  y: number;
  z: number;
  respawnTime: number;
  createdAt: Date;
}

const ResourceNodeSchema: Schema = new Schema({
  nodeType: {
    type: String,
    required: true,
    enum: ['tree', 'rock', 'fish', 'herb', 'ore'],
    index: true
  },
  specificType: {
    type: String,
    required: true,
    index: true
  },
  x: {
    type: Number,
    required: true
  },
  y: {
    type: Number,
    required: true
  },
  z: {
    type: Number,
    required: true
  },
  respawnTime: {
    type: Number,
    required: true,
    default: 30 // Default respawn time in seconds
  }
}, {
  timestamps: true
});

// Create compound spatial index for location-based queries
ResourceNodeSchema.index({ x: 1, z: 1 });

// Method to get all resource nodes for a specific type
ResourceNodeSchema.statics.findByType = function(nodeType: string) {
  return this.find({ nodeType });
};

// Method to find nodes within a radius
ResourceNodeSchema.statics.findNearby = function(x: number, z: number, radius: number) {
  return this.find({
    x: { $gte: x - radius, $lte: x + radius },
    z: { $gte: z - radius, $lte: z + radius }
  });
};

export default mongoose.model<IResourceNode>('ResourceNode', ResourceNodeSchema); 