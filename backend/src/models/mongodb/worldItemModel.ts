import mongoose, { Schema, Document } from 'mongoose';

export interface IWorldItem extends Document {
  itemId: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
  createdAt: Date;
  expiresAt?: Date;
}

const WorldItemSchema: Schema = new Schema({
  itemId: {
    type: String,
    required: true,
    unique: true
  },
  itemType: {
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
  expiresAt: {
    type: Date,
    default: function() {
      // Default expiration is 5 minutes from now
      return new Date(Date.now() + 5 * 60 * 1000);
    },
    index: true,
    expires: 0 // Use TTL index directly in schema definition
  }
}, {
  timestamps: true
});

// Create compound spatial index for location-based queries
WorldItemSchema.index({ x: 1, z: 1 });

// Method to find items within a radius
WorldItemSchema.statics.findNearby = function(x: number, z: number, radius: number) {
  return this.find({
    x: { $gte: x - radius, $lte: x + radius },
    z: { $gte: z - radius, $lte: z + radius }
  });
};

// Method to find items by type
WorldItemSchema.statics.findByType = function(itemType: string) {
  return this.find({ itemType });
};

export default mongoose.model<IWorldItem>('WorldItem', WorldItemSchema); 